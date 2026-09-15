/**
 * Reading the pixels behind an image URL we own.
 *
 * Every AI step in the catalog pipeline needs the actual bytes of a product
 * photo. Until now each call site either `fetch`ed the public bucket URL without
 * checking the response, or handed that URL to a third-party provider and hoped
 * the provider could fetch it. Both are unsafe against the two failure modes
 * this bucket really has:
 *
 *   • A public `*.r2.dev` URL is a development endpoint and is aggressively
 *     rate limited. One thumbnail batch asks for 5 products × 8 reference
 *     photos, so bursts of 429 are routine — and a provider reports that back
 *     only as an opaque "image fetch failed". Production now serves the same
 *     objects from `media.y2kase.com`, but AI steps still must not depend on
 *     the public host.
 *   • A few `product_images` rows still point at objects that were never
 *     uploaded (or were later deleted). R2 answers 404 with an HTML error page,
 *     so a caller that ignores the status ends up handing ~27 KB of Cloudflare
 *     markup to an image model.
 *
 * So this module makes the byte read authoritative. A URL inside our own bucket
 * is read through the S3 API with our credentials: no public endpoint, no rate
 * limit, and a missing object is an unambiguous 404 rather than a valid-looking
 * body. Foreign hosts fall back to HTTP with backoff on the statuses that are
 * worth retrying. Either way the bytes are decoded before they are returned, so
 * a caller that receives a {@link LoadedImage} can trust that it is one.
 *
 * Node-only (Sharp + the S3 client). Never import from a client component.
 */
import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { makeR2Client, r2KeyFromUrl } from "./r2";
import { mapWithConcurrency } from "./concurrency";

/** Refuse absurd payloads before Sharp allocates for them. */
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/** HTTP attempts per URL (foreign hosts only — the S3 path has its own retries). */
const MAX_HTTP_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 400;
const MAX_BACKOFF_MS = 6_000;

/** How many images to read at once. The S3 API is not the rate-limited path,
 *  but a product can carry 20+ photos and each one costs memory while decoding. */
const DEFAULT_READ_CONCURRENCY = 6;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** An image, verified to be decodable, with everything a provider needs. */
export type LoadedImage = {
  /** The URL it was read from, so callers can report on a specific reference. */
  url: string;
  bytes: Buffer;
  /** Detected MIME type — never guessed from the file extension. */
  mime: string;
  format: string;
  width: number;
  height: number;
};

/**
 * Why one image could not be produced.
 *
 * The distinction is what makes an operator-facing message actionable:
 * `missing` means the object is gone and no retry will help (re-upload the
 * photo), while `unreachable` is a transport problem that already exhausted its
 * retries and may succeed later.
 */
export type ImageFailureKind = "missing" | "unreachable" | "unreadable";

export type ImageFailure = { url: string; kind: ImageFailureKind; reason: string };

export class ImageUnavailableError extends Error {
  readonly url: string;
  readonly kind: ImageFailureKind;

  constructor(url: string, kind: ImageFailureKind, reason: string) {
    super(reason);
    this.name = "ImageUnavailableError";
    this.url = url;
    this.kind = kind;
  }

  get failure(): ImageFailure {
    return { url: this.url, kind: this.kind, reason: this.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bucket reads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One lazily-built S3 client for the process. `undefined` means "not tried
 * yet", `null` means the credentials are absent — in which case we fall back to
 * plain HTTP rather than failing, so a deployment without R2 keys still works.
 */
let bucketClient: S3Client | null | undefined;

function r2(): S3Client | null {
  if (bucketClient === undefined) {
    try {
      bucketClient = makeR2Client();
    } catch {
      bucketClient = null;
    }
  }
  return bucketClient;
}

function statusOf(err: unknown): number | undefined {
  const meta = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata;
  return meta?.httpStatusCode;
}

function isMissingObject(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  return name === "NoSuchKey" || name === "NotFound" || statusOf(err) === 404;
}

/** Read one object out of our bucket, retrying only genuinely transient faults. */
async function readFromBucket(
  client: S3Client,
  bucket: string,
  key: string,
  url: string,
): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      if (!res.Body) {
        throw new ImageUnavailableError(url, "unreadable", "storage returned an empty body");
      }
      return Buffer.from(await res.Body.transformToByteArray());
    } catch (err) {
      if (err instanceof ImageUnavailableError) throw err;
      if (isMissingObject(err)) {
        throw new ImageUnavailableError(
          url,
          "missing",
          `not found in storage (${key})`,
        );
      }
      lastError = err;
      if (attempt < 2) await sleep(BASE_BACKOFF_MS * 2 ** attempt);
    }
  }
  throw new ImageUnavailableError(
    url,
    "unreachable",
    `storage read failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP reads (foreign hosts, and provider result URLs)
// ─────────────────────────────────────────────────────────────────────────────

/** Statuses where the server is telling us to come back, not to give up. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/** Honour `Retry-After` (delta-seconds or HTTP-date) when the server sends one. */
function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

async function readOverHttp(url: string): Promise<Buffer> {
  let lastReason = "download failed";
  for (let attempt = 0; attempt < MAX_HTTP_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { redirect: "follow" });
    } catch (err) {
      lastReason = `network error: ${err instanceof Error ? err.message : String(err)}`;
      if (attempt < MAX_HTTP_ATTEMPTS - 1) await backoff(attempt, null);
      continue;
    }

    if (res.ok) {
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.byteLength > MAX_IMAGE_BYTES) {
        throw new ImageUnavailableError(
          url,
          "unreadable",
          `image is too large (${Math.round(bytes.byteLength / 1024 / 1024)} MB)`,
        );
      }
      return bytes;
    }

    // 404/403 on a foreign host is an answer, not a hiccup — stop immediately so
    // a dead reference is reported as dead instead of after four round trips.
    if (!isRetryableStatus(res.status)) {
      throw new ImageUnavailableError(
        url,
        res.status === 404 || res.status === 410 ? "missing" : "unreachable",
        `download failed with HTTP ${res.status}`,
      );
    }

    lastReason = `download failed with HTTP ${res.status}`;
    if (attempt < MAX_HTTP_ATTEMPTS - 1) {
      await backoff(attempt, retryAfterMs(res.headers.get("retry-after")));
    }
  }
  throw new ImageUnavailableError(url, "unreachable", lastReason);
}

async function backoff(attempt: number, hinted: number | null): Promise<void> {
  const exponential = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
  await sleep(Math.min(MAX_BACKOFF_MS, hinted ?? exponential) + Math.random() * 200);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Sharp's format name → the MIME type providers expect. */
function mimeFor(format: string): string {
  return format === "jpeg" ? "image/jpeg" : `image/${format}`;
}

/** Sharp's format name → a conventional file extension. */
export function extensionFor(image: LoadedImage): string {
  return image.format === "jpeg" ? "jpg" : image.format;
}

/**
 * Read and verify a single image. Throws {@link ImageUnavailableError} — which
 * carries whether the problem is permanent — for anything that isn't a usable
 * image.
 */
export async function loadImage(url: string): Promise<LoadedImage> {
  const trimmed = url.trim();
  if (!trimmed) throw new ImageUnavailableError(url, "missing", "empty image URL");

  const key = r2KeyFromUrl(trimmed);
  const bucket = process.env.R2_BUCKET_NAME;
  const client = key ? r2() : null;

  const bytes =
    key && client && bucket
      ? await readFromBucket(client, bucket, key, trimmed)
      : await readOverHttp(trimmed);

  let format: string | undefined;
  let width: number | undefined;
  let height: number | undefined;
  try {
    const meta = await sharp(bytes).metadata();
    format = meta.format;
    width = meta.width;
    height = meta.height;
  } catch {
    // Fall through to the shared error below — Sharp's own message ("Input
    // buffer contains unsupported image format") tells an operator nothing
    // about which reference is at fault.
  }
  if (!format || !width || !height) {
    throw new ImageUnavailableError(
      trimmed,
      "unreadable",
      `not a decodable image (${bytes.byteLength} bytes)`,
    );
  }

  return { url: trimmed, bytes, mime: mimeFor(format), format, width, height };
}

/**
 * Read a set of images, keeping the successes and reporting the rest.
 *
 * Deliberately partial: a product with one dead photo among ten should still
 * get a thumbnail, and the caller is the only place that can decide how many
 * usable references are enough. Order is preserved and duplicate URLs are read
 * once.
 */
export async function loadImages(
  urls: readonly string[],
  concurrency = DEFAULT_READ_CONCURRENCY,
): Promise<{ images: LoadedImage[]; failures: ImageFailure[] }> {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  const settled = await mapWithConcurrency(unique, concurrency, async (url) => {
    try {
      return await loadImage(url);
    } catch (err) {
      return err instanceof ImageUnavailableError
        ? err.failure
        : ({
            url,
            kind: "unreachable",
            reason: err instanceof Error ? err.message : String(err),
          } satisfies ImageFailure);
    }
  });

  const images: LoadedImage[] = [];
  const failures: ImageFailure[] = [];
  for (const result of settled) {
    if ("bytes" in result) images.push(result);
    else failures.push(result);
  }
  return { images, failures };
}

/**
 * Encode a loaded photo as a data URL for a vision model.
 *
 * Matches ingest: max-edge 1200 WebP, so a backfill sees the same pixels the
 * upload path sent. Callers that already have a data URL (ingest) skip this.
 */
export async function visionDataUrl(
  image: LoadedImage,
  maxEdge = 1200,
): Promise<string> {
  const buf = await sharp(image.bytes)
    .rotate()
    .resize(maxEdge, maxEdge, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  return `data:image/webp;base64,${buf.toString("base64")}`;
}

/**
 * One sentence an operator can act on, given the failures that sank a step.
 * Leads with the permanent problem, because "re-upload the photo" and "try
 * again later" are different instructions.
 */
export function describeImageFailures(
  failures: readonly ImageFailure[],
  total: number,
): string {
  const count = failures.length;
  const missing = failures.filter((f) => f.kind === "missing").length;
  const unreadable = failures.filter((f) => f.kind === "unreadable").length;
  const unreachable = count - missing - unreadable;

  const scope =
    count < total
      ? `${count} of ${total} source photos`
      : total === 1
        ? "The only source photo"
        : `All ${total} source photos`;
  const verb = count === 1 ? "is" : "are";

  if (missing === count) {
    return `${scope} ${verb} missing from storage — re-upload the product's photos, or use Upload to set a thumbnail directly.`;
  }
  const parts = [
    missing > 0 ? `${missing} missing from storage` : null,
    unreadable > 0 ? `${unreadable} not a readable image` : null,
    unreachable > 0 ? `${unreachable} unreachable after retries` : null,
  ].filter(Boolean);
  return `${scope} could not be read (${parts.join(", ")}).`;
}

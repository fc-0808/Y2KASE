import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { eq, inArray } from "drizzle-orm";
import type { S3Client } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import {
  products,
  productImages,
  productOptions,
  collections,
  productCollections,
} from "@/lib/db/schema";
import { matchCollectionSlugs } from "@/lib/catalog/collections-config";
import {
  generateProductCopy,
  classifyImageStyles,
  slugify,
  type CopyTypeHint,
} from "@/lib/ai";
import {
  getProductType,
  inferProductTypeId,
} from "@/lib/catalog/product-types";
import { dhashFromBuffer } from "@/lib/catalog/phash";
import {
  decideMagSafe,
  hasTextualMagSafe,
  MAGSAFE_LINE,
} from "@/lib/catalog/magsafe";
import {
  findNearestDuplicate,
  type NearestDuplicate,
} from "@/lib/catalog/duplicates";
import { mapWithConcurrency } from "@/lib/catalog/concurrency";
import { uploadWebpToR2, uploadVideoToR2 } from "@/lib/catalog/r2";
import {
  pickPrimaryVideo,
  videoSlotIndex,
  type DiscoveredProductFolder,
} from "@/lib/catalog/discover";

const WEBP_MAX_WIDTH = 1200;
const WEBP_QUALITY = 82;
/** Parallelism for the I/O-bound per-image work within a single product. */
const CONVERT_CONCURRENCY = 6;
const UPLOAD_CONCURRENCY = 8;

export function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function toBase64DataUrl(buf: Buffer): string {
  return `data:image/webp;base64,${buf.toString("base64")}`;
}

const VIDEO_CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

export type IngestResult = {
  productId: number;
  slug: string;
  title: string;
  imageCount: number;
  hasVideo: boolean;
  /** The product type the row was created with (after AI auto-detect). */
  productType: string;
  /** True when the type was inferred by the vision model, not pinned. */
  autoDetectedType: boolean;
  /** Set when this product's main photo matches an existing one. */
  duplicateOf?: NearestDuplicate;
  /** The primary image's perceptual hash, so callers can grow a dup index. */
  primaryPhash: string | null;
};

/**
 * Deterministic overrides sourced from a listing manifest / catalog config.
 * Any field left undefined falls back to AI-generated copy or type defaults,
 * so partial manifests work (pin a price, let AI write the rest).
 */
export type IngestOverrides = {
  sku?: string;
  title?: string;
  description?: string;
  tags?: string[];
  materials?: string;
  altText?: string;
  price?: number;
  status?: "draft" | "active";
  /** Collection slugs to force-add on top of auto-classification. */
  collections?: string[];
};

export type IngestOptions = {
  folder: DiscoveredProductFolder;
  /**
   * Product type id, or "auto" to let the vision model classify it from the
   * photos (falls back to {@link IngestOptions.fallbackProductTypeId}).
   */
  productTypeId: string;
  /** Type to use when "auto" can't confidently classify. Defaults to iphone_case. */
  fallbackProductTypeId?: string;
  r2: S3Client;
  bucket: string;
  currency: string;
  /** Key prefix in R2 (folderPath sanitised). */
  keyPrefix?: string;
  /** Deterministic data that wins over AI / type defaults. */
  overrides?: IngestOverrides;
  /**
   * Optional injected duplicate detector. When the bulk pipeline supplies a
   * preloaded in-memory index, we use it instead of a per-product DB scan.
   */
  detectDuplicate?: (phash: string) => NearestDuplicate | null;
  log?: (msg: string) => void;
};

/**
 * Match a freshly ingested product to the collection taxonomy and persist the
 * membership rows (idempotent). Resolves matched slugs to ids against the live
 * `collections` table, so only seeded collections are linked.
 *
 * `explicitSlugs` (from a listing manifest / category rule) are force-added on
 * top of the auto-classified ones, letting a human override the AI when needed.
 */
async function assignCollections(
  productId: number,
  signals: {
    tags: string[];
    title: string;
    sourceFolder: string | null;
    explicitSlugs?: string[];
    log: (msg: string) => void;
  },
): Promise<void> {
  const slugs = Array.from(
    new Set([
      ...matchCollectionSlugs(signals),
      ...(signals.explicitSlugs ?? []),
    ]),
  );
  if (slugs.length === 0) return;

  const rows = await db.query.collections.findMany({
    where: inArray(collections.slug, slugs),
    columns: { id: true, slug: true },
  });
  if (rows.length === 0) return;

  await db
    .insert(productCollections)
    .values(rows.map((c) => ({ productId, collectionId: c.id })))
    .onConflictDoNothing();
  signals.log(`classified → ${rows.map((c) => c.slug).join(", ")}`);
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base || "product";
  let n = 1;
  while (true) {
    const existing = await db.query.products.findFirst({
      where: eq(products.slug, slug),
      columns: { id: true },
    });
    if (!existing) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

/**
 * Ingest a single product folder:
 *   convert → AI copy + style classification → upload to R2 → insert into Neon.
 * Returns the created draft product. Pure of any SQLite resume tracking — the
 * caller decides how to record progress.
 */
export async function ingestProductFolder(
  opts: IngestOptions,
): Promise<IngestResult> {
  const { folder, productTypeId, r2, bucket, currency } = opts;
  const overrides = opts.overrides ?? {};
  const log = opts.log ?? (() => {});
  const autoType = productTypeId === "auto";
  const fallbackTypeId = opts.fallbackProductTypeId ?? "iphone_case";
  // When the type is pinned we know it up front and can tailor the AI prompt to
  // it; in "auto" mode we resolve it after the model classifies the photos.
  const pinnedType = autoType ? null : getProductType(productTypeId);
  const sanitise = (s: string) => s.replace(/[^a-zA-Z0-9/_-]/g, "_");
  const keyBase =
    opts.keyPrefix ??
    (overrides.sku ? sanitise(overrides.sku) : sanitise(folder.folderPath));

  // 1. Convert images to WebP — in parallel (bounded), order preserved.
  const webp = await mapWithConcurrency(
    folder.imageFiles,
    CONVERT_CONCURRENCY,
    async (file) => ({
      filename: path.parse(file).name,
      buffer: await sharp(file)
        .resize({ width: WEBP_MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer(),
    }),
  );
  log(`converted ${webp.length} image(s) to WebP`);

  // 2. AI copy (first 4 images) + per-image style classification (all images).
  //    Skip the (paid) copy call entirely when the manifest already pins both a
  //    title and description; otherwise let AI fill the gaps.
  const dataUrls = webp.map((w) => toBase64DataUrl(w.buffer));
  const needsCopy = !overrides.title || !overrides.description;
  const typeHint: CopyTypeHint | undefined = pinnedType
    ? {
        id: pinnedType.id,
        label: pinnedType.label,
        noun: pinnedType.noun,
        isPhoneCase: pinnedType.id === "iphone_case",
      }
    : undefined;
  const copy = needsCopy
    ? await generateProductCopy(dataUrls, folder.categoryHint, typeHint)
    : null;
  if (copy) log(`AI title: ${copy.title}`);

  // Resolve the product type. In "auto" mode the vision model's classification
  // (its `category`) picks the type; if it can't, we fall back. A pinned type
  // always wins.
  const type =
    pinnedType ??
    (() => {
      const inferred = inferProductTypeId(copy?.category);
      if (inferred) {
        log(`AI classified type → ${inferred} (from "${copy?.category}")`);
        return getProductType(inferred);
      }
      log(`AI could not classify type — falling back to ${fallbackTypeId}`);
      return getProductType(fallbackTypeId);
    })();

  let title = overrides.title ?? copy?.title ?? "Untitled Y2KASE Product";
  let description = overrides.description ?? copy?.description ?? "";
  const altText = overrides.altText ?? copy?.altText ?? title;
  const materials = overrides.materials ?? copy?.materials ?? null;
  if (!needsCopy) log(`manifest title: ${title}`);

  // MagSafe routing: auto-apply only with two corroborating signals or a clear
  // visual; a lone low-confidence guess is queued for human review instead of
  // editing live copy. Manifest-pinned copy is never overwritten. The "magsafe"
  // tag (added below when confirmed) also drives collection classification.
  const magDecision = decideMagSafe({
    vision: copy?.magsafe === true,
    confidence: copy?.magsafeConfidence ?? "none",
    textual: hasTextualMagSafe(overrides.title, copy?.title, folder.folderPath),
  });
  const confirmMagsafe = magDecision === "confirmed";
  const needsMagsafeReview = magDecision === "review";
  if (confirmMagsafe) {
    if (!overrides.title && !/magsafe/i.test(title)) {
      title = `${title} — MagSafe`;
    }
    if (!overrides.description && !/magsafe/i.test(description)) {
      description = description
        ? `${description}\n\n${MAGSAFE_LINE}`
        : MAGSAFE_LINE;
    }
    log("MagSafe confirmed → tagged + copy updated");
  } else if (needsMagsafeReview) {
    log("MagSafe uncertain → queued for review");
  }

  let styleMap: Record<string, string[]> = {};
  if (type.id === "iphone_case") {
    try {
      styleMap = await classifyImageStyles(
        webp.map((w, i) => ({ filename: w.filename, imageUrl: dataUrls[i] })),
      );
    } catch (e) {
      log(
        `style classification skipped: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  // 3. Upload images to R2 + compute each perceptual hash — in parallel
  //    (bounded), order preserved. Upload (network) and hash (CPU) for one
  //    image run concurrently, and many images run at once, so a 12-photo
  //    product uploads in a few waves instead of 12 serial round-trips.
  const uploaded = await mapWithConcurrency(
    webp,
    UPLOAD_CONCURRENCY,
    async (w) => {
      const key = `products/${keyBase}/${w.filename}.webp`;
      const [url, phash] = await Promise.all([
        uploadWebpToR2(r2, bucket, key, w.buffer),
        dhashFromBuffer(w.buffer),
      ]);
      log(`uploaded → ${url}`);
      return {
        url,
        filename: w.filename,
        styleTags: styleMap[w.filename] ?? [],
        phash,
      };
    },
  );

  // 4. Upload primary video if present, recording where it sits in the gallery
  //    so the combined media order matches the seller's folder numbering.
  let videoUrl: string | null = null;
  let videoPosition: number | null = null;
  const folderBasename = path.basename(folder.absPath);
  const primaryVideo = pickPrimaryVideo(folder.videoFiles, folderBasename);
  if (primaryVideo) {
    const ext = path.extname(primaryVideo).toLowerCase();
    const contentType = VIDEO_CONTENT_TYPES[ext] ?? "video/mp4";
    const body = fs.readFileSync(primaryVideo);
    const key = `products/${keyBase}/video${ext}`;
    videoUrl = await uploadVideoToR2(r2, bucket, key, body, contentType);
    videoPosition = videoSlotIndex(folder.imageFiles, primaryVideo);
    log(`uploaded video → ${videoUrl} (slot ${videoPosition})`);
  }

  // 4b. Duplicate check — compare this product's primary-image fingerprint
  //     against the existing catalogue BEFORE inserting (so it never matches
  //     itself). Non-destructive: we still create the draft, but flag it so a
  //     human can decide. Catches the same product re-uploaded with re-encoded
  //     or resized photos that a byte-hash would miss.
  const primaryPhash = uploaded[0]?.phash ?? null;
  const duplicateOf = primaryPhash
    ? opts.detectDuplicate
      ? opts.detectDuplicate(primaryPhash)
      : await findNearestDuplicate(primaryPhash)
    : null;
  if (duplicateOf) {
    log(
      `⚠ possible duplicate of #${duplicateOf.id} "${duplicateOf.title}" ` +
        `(distance ${duplicateOf.distance}/64) → review at /admin/products/duplicates`,
    );
  }

  // 5. Insert product + children into Neon (draft unless the manifest publishes).
  const slug = await uniqueSlug(
    overrides.sku ? slugify(overrides.sku) : slugify(title),
  );
  const collectionTag = folder.categoryHint.split(" / ")[0]?.toLowerCase();
  const tags = Array.from(
    new Set(
      [
        ...(copy?.tags ?? []),
        ...(overrides.tags ?? []),
        collectionTag,
        ...(confirmMagsafe ? ["magsafe"] : []),
      ].filter(Boolean) as string[],
    ),
  );
  const price =
    overrides.price != null
      ? String(overrides.price)
      : String(type.getBasePrice(currency));
  const status = overrides.status ?? "draft";

  const [product] = await db
    .insert(products)
    .values({
      slug,
      title,
      description,
      price,
      currency,
      materials,
      tags,
      status,
      sourceShops: "local",
      productType: type.id,
      videoUrl,
      videoPosition,
      sourceFolder: folder.folderPath,
      needsMagsafeReview,
      aiModel: process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini",
    })
    .returning({ id: products.id });

  await db.insert(productImages).values(
    uploaded.map((u, idx) => ({
      productId: product.id,
      url: u.url,
      position: idx,
      altText: idx === 0 ? altText : null,
      aiAnalyzed: true,
      styleTags: u.styleTags,
      sourceFilename: u.filename,
      phash: u.phash,
    })),
  );

  if (type.options.length > 0) {
    await db.insert(productOptions).values(
      type.options.map((opt, position) => ({
        productId: product.id,
        name: opt.name,
        position,
        values: opt.values,
      })),
    );
  }

  // 6. Auto-classify into collections from the product's text signals
  //    (tags + title + source folder). Membership rows are best-effort: a
  //    missing/un-seeded collection simply isn't linked. Run `npm run
  //    seed:collections` so the matched slugs exist.
  await assignCollections(product.id, {
    tags,
    title,
    sourceFolder: folder.folderPath,
    explicitSlugs: overrides.collections,
    log,
  });

  return {
    productId: product.id,
    slug,
    title,
    imageCount: uploaded.length,
    hasVideo: Boolean(videoUrl),
    productType: type.id,
    autoDetectedType: autoType,
    duplicateOf: duplicateOf ?? undefined,
    primaryPhash,
  };
}

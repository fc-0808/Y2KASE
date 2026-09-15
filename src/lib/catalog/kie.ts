/**
 * The KIE gateway transport — Nano Banana Pro, Recraft and friends.
 *
 * KIE models image work as an async job: `createTask` returns a task id, you
 * poll `recordInfo` until it flips to `success`, then download the result URL it
 * hands back.
 *
 * The important design decision here is HOW reference images reach the gateway.
 * KIE's task API accepts image URLs and fetches them itself, which looks free
 * but makes every generation depend on a stranger's network being able to reach
 * our bucket. It frequently cannot: a `*.r2.dev` development URL rate-limits
 * bursts, and a missing object comes back from the gateway as the same
 * undiagnosable "image fetch failed. Check access settings or use our File
 * Upload API instead." for every cause.
 *
 * So we take the gateway's own advice and stop asking it to fetch anything: we
 * read the bytes ourselves (see `./image-source`), push them to KIE's File
 * Upload API, and reference the temporary copies it hosts. Uploads are free, add
 * one fast round trip, and turn a whole class of opaque provider failures into
 * errors we can name before spending a task.
 *
 * Node-only. Never import from a client component.
 */
import { loadImage } from "./image-source";
import { mapWithConcurrency } from "./concurrency";

/** Task API. */
const TASK_BASE = "https://api.kie.ai";
/** File Upload API — a different host to the task API, by KIE's own design. */
const UPLOAD_BASE = "https://kieai.redpandaai.co";

/** Where our uploads land in KIE's temporary storage (they expire on their own). */
const UPLOAD_PATH = "y2kase/references";

/** Reference uploads in flight per task. */
const UPLOAD_CONCURRENCY = 3;

const TASK_TIMEOUT_MS = 240_000;
const POLL_INTERVAL_MS = 3_000;
const MAX_REQUEST_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 600;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A gateway-side failure, with KIE's own code kept for triage. */
export class KieError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "KieError";
    this.code = code;
  }
}

export function requireKieApiKey(): string {
  const key = process.env.KIE_API_KEY;
  if (!key) throw new KieError("KIE_API_KEY is not set.");
  return key;
}

/**
 * POST/GET against KIE with retries on transport faults and 5xx/429. A gateway
 * hiccup must not cost a whole batch, and these calls are idempotent enough to
 * repeat: a duplicated `createTask` at worst burns one task.
 */
async function request(
  url: string,
  init: RequestInit,
  what: string,
): Promise<unknown> {
  let lastReason = `${what} failed`;
  for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, init);
      const json = (await res.json().catch(() => null)) as {
        code?: number;
        msg?: string;
      } | null;

      if (res.ok && json?.code === 200) return json;

      const detail = json?.msg ?? `HTTP ${res.status}`;
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable) throw new KieError(`${what} failed: ${detail}`);
      lastReason = `${what} failed: ${detail}`;
    } catch (err) {
      if (err instanceof KieError) throw err;
      lastReason = `${what} failed: ${err instanceof Error ? err.message : String(err)}`;
    }
    if (attempt < MAX_REQUEST_ATTEMPTS - 1) {
      await sleep(BASE_BACKOFF_MS * 2 ** attempt + Math.random() * 200);
    }
  }
  throw new KieError(lastReason);
}

/**
 * Put image bytes in KIE's temporary storage and return the URL the task API
 * should reference. Multipart rather than base64: it avoids the 33% inflation,
 * and the filename we send is what gives the stored copy its extension.
 */
export async function kieUploadImage(
  apiKey: string,
  image: { bytes: Buffer; mime: string; filename: string },
): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(image.bytes)], { type: image.mime }),
    image.filename,
  );
  form.append("uploadPath", UPLOAD_PATH);

  const json = (await request(
    `${UPLOAD_BASE}/api/file-stream-upload`,
    { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form },
    "KIE upload",
  )) as { data?: { downloadUrl?: string } };

  const url = json.data?.downloadUrl;
  if (!url) throw new KieError("KIE upload returned no file URL.");
  return url;
}

/**
 * Upload several references, preserving order.
 *
 * Bounded rather than all-at-once: a "Generate all" run has several products in
 * flight, each with up to eight references, and firing forty uploads at one
 * endpoint is the same burst behaviour that made the gateway's own image fetches
 * unreliable in the first place.
 */
export async function kieUploadImages(
  apiKey: string,
  images: readonly { bytes: Buffer; mime: string; filename: string }[],
): Promise<string[]> {
  return mapWithConcurrency(images, UPLOAD_CONCURRENCY, (image) =>
    kieUploadImage(apiKey, image),
  );
}

async function kieCreateTask(apiKey: string, body: unknown): Promise<string> {
  const json = (await request(
    `${TASK_BASE}/api/v1/jobs/createTask`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    "KIE createTask",
  )) as { data?: { taskId?: string } };

  const taskId = json.data?.taskId;
  if (!taskId) throw new KieError("KIE createTask returned no task id.");
  return taskId;
}

/** Poll one task to completion and return its first result URL. */
async function kieAwaitResult(apiKey: string, taskId: string): Promise<string> {
  const deadline = Date.now() + TASK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    let data:
      | {
          state?: string;
          resultJson?: string;
          failCode?: string;
          failMsg?: string;
        }
      | undefined;
    try {
      const json = (await request(
        `${TASK_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
        "KIE recordInfo",
      )) as { data?: typeof data };
      data = json.data;
    } catch {
      // The task is still running regardless of whether we managed to read its
      // status, so a failed poll must not fail the generation.
      continue;
    }
    if (!data) continue;

    if (data.state === "success") {
      const parsed = data.resultJson
        ? (JSON.parse(data.resultJson) as { resultUrls?: string[] })
        : null;
      const url = parsed?.resultUrls?.[0];
      if (!url) throw new KieError("KIE succeeded but returned no result URL.");
      return url;
    }
    if (data.state === "fail") {
      throw new KieError(
        `KIE task failed: ${data.failMsg ?? data.failCode ?? "unknown error"}`,
        data.failCode,
      );
    }
    // waiting | queuing | generating → keep polling
  }
  throw new KieError(`KIE task timed out after ${TASK_TIMEOUT_MS / 1000}s.`);
}

/**
 * Run one image task end to end and return the generated bytes. The result URL
 * is downloaded through the shared loader, so a truncated or non-image response
 * from the gateway's CDN is caught here rather than by Sharp three calls later.
 */
export async function kieRunImageTask(
  apiKey: string,
  body: { model: string; input: Record<string, unknown> },
): Promise<Buffer> {
  const taskId = await kieCreateTask(apiKey, body);
  const url = await kieAwaitResult(apiKey, taskId);
  const result = await loadImage(url);
  return result.bytes;
}

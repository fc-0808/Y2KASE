/**
 * Shared Kie.ai Nano Banana Pro (Gemini 3 Pro Image) client for the brand-asset
 * generators.
 *
 * The gateway models image generation as an async job: `createTask` returns a
 * task id, which you poll until it flips to `success` and hands back a CDN URL
 * you then download. That three-step dance was copy-pasted verbatim into every
 * generator script (collection covers, device covers, promo assets); it lives
 * here once instead, so a change to the gateway contract — or to the retry and
 * timeout policy — is a one-file fix rather than a hunt through `scripts/`.
 *
 * Node-only (uses `fetch` + `Buffer`) and requires `KIE_API_KEY`. Callers are
 * expected to have loaded `.env.local` already.
 */

const KIE_BASE = "https://api.kie.ai";

/** The Kie.ai model slug for Nano Banana Pro. */
const MODEL = "nano-banana-pro";

/** Give up on a single image after this long — a stuck job must not hang a run. */
const TASK_TIMEOUT_MS = 240_000;
const POLL_INTERVAL_MS = 3_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type NanoBananaRequest = {
  prompt: string;
  /** Output aspect ratio, e.g. "16:9", "4:3", "1:1". */
  aspectRatio: string;
  /** Gateway resolution tier. Defaults to "2K". */
  resolution?: "1K" | "2K" | "4K";
  /** Reference image URLs to condition on (image-to-image). Omitted when empty. */
  imageUrls?: string[];
};

/**
 * Read the gateway key, failing with an actionable message. Generators call
 * this before doing any work so a missing key costs nothing.
 */
export function requireKieApiKey(): string {
  const key = process.env.KIE_API_KEY;
  if (!key) {
    throw new Error(
      "KIE_API_KEY is not set. Add it to .env.local before generating brand assets.",
    );
  }
  return key;
}

async function createTask(
  apiKey: string,
  req: NanoBananaRequest,
): Promise<string> {
  const res = await fetch(`${KIE_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: {
        prompt: req.prompt,
        ...(req.imageUrls?.length ? { image_input: req.imageUrls } : {}),
        aspect_ratio: req.aspectRatio,
        resolution: req.resolution ?? "2K",
        output_format: "png",
      },
    }),
  });

  const json = (await res.json().catch(() => null)) as {
    code?: number;
    msg?: string;
    data?: { taskId?: string };
  } | null;

  if (!res.ok || json?.code !== 200 || !json.data?.taskId) {
    throw new Error(`createTask failed: ${json?.msg ?? `HTTP ${res.status}`}`);
  }
  return json.data.taskId;
}

async function awaitResultUrl(apiKey: string, taskId: string): Promise<string> {
  const deadline = Date.now() + TASK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const res = await fetch(
      `${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    const json = (await res.json().catch(() => null)) as {
      data?: {
        state?: string;
        resultJson?: string;
        failCode?: string;
        failMsg?: string;
      };
    } | null;

    const data = json?.data;
    // A transient read error leaves the job running — keep polling rather than
    // failing the asset outright.
    if (!data) continue;

    if (data.state === "success") {
      const parsed = data.resultJson
        ? (JSON.parse(data.resultJson) as { resultUrls?: string[] })
        : null;
      const url = parsed?.resultUrls?.[0];
      if (!url) throw new Error("succeeded but returned no result URL");
      return url;
    }
    if (data.state === "fail") {
      throw new Error(data.failMsg ?? data.failCode ?? "task failed");
    }
  }
  throw new Error(`task timed out after ${TASK_TIMEOUT_MS / 1000}s`);
}

/** Generate one image and return its raw (PNG) bytes. */
export async function generateImage(
  apiKey: string,
  req: NanoBananaRequest,
): Promise<Buffer> {
  const taskId = await createTask(apiKey, req);
  const url = await awaitResultUrl(apiKey, taskId);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

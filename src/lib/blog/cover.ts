/**
 * Blog hero-image generation with Nano Banana Pro (Gemini 3 Pro Image).
 *
 * Reached through the KIE gateway — the same provider the collection-cover and
 * thumbnail-cleanup pipelines use (see scripts/generate-collection-covers.ts).
 * We create a task, poll for the result, downscale to a web-ready WebP with
 * sharp, and persist it to Cloudflare R2 (dynamic covers can't live in
 * /public, which is build-time only). Returns the public R2 URL.
 *
 * Everything here is best-effort: any failure returns null so the caller keeps
 * the catalog-photo fallback cover and the post still publishes.
 */
import sharp from "sharp";
import { makeR2Client, uploadImageToR2 } from "@/lib/catalog/r2";

const KIE_BASE = "https://api.kie.ai";
const ASPECT = "16:9"; // editorial landscape hero
const RESOLUTION = "2K";
const OUT_WIDTH = 1280; // crisp for the max-w-3xl post hero + cards, small on disk

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** KIE + R2 both configured — cover generation can run. */
export function isCoverGenConfigured(): boolean {
  return Boolean(process.env.KIE_API_KEY && process.env.R2_BUCKET_NAME);
}

/** Configured AND not explicitly disabled via BLOG_COVER_IMAGES=false. */
export function isCoverGenEnabled(): boolean {
  return isCoverGenConfigured() && process.env.BLOG_COVER_IMAGES !== "false";
}

function buildCoverPrompt(opts: { title: string; theme?: string | null }): string {
  const theme = opts.theme ? `Theme/motif to feature: ${opts.theme}.` : "";
  return [
    "Editorial blog hero image for a Gen-Z kawaii / Y2K phone-accessories brand.",
    "A stylish product flat-lay scene: a trendy smartphone wearing a cute phone case with dangling charms and a pop grip, arranged on an iridescent pastel-pink and lavender holographic surface with soft studio lighting, gentle light streaks and delicate bokeh sparkles, plus a few tasteful Y2K props (beaded strap, tiny stars, small accessories).",
    theme,
    "Glossy, high-end, dreamy and colourful but cohesive and uncluttered, with clean negative space. 16:9 landscape composition.",
    "Absolutely NO text, letters, numbers, captions, logos or watermarks anywhere in the image.",
  ]
    .filter(Boolean)
    .join(" ");
}

async function kieCreateTask(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(`${KIE_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "nano-banana-pro",
      input: {
        prompt,
        aspect_ratio: ASPECT,
        resolution: RESOLUTION,
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

async function kiePollResult(
  apiKey: string,
  taskId: string,
  deadlineMs = 150_000,
): Promise<string> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    await sleep(3000);
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
  throw new Error("task timed out");
}

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Generate one on-brand blog hero and store it in R2. Returns the public URL,
 * or null on any failure (caller falls back to the catalog-photo cover).
 */
export async function generateBlogCover(opts: {
  title: string;
  theme?: string | null;
}): Promise<string | null> {
  const apiKey = process.env.KIE_API_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!apiKey || !bucket) return null;

  try {
    const prompt = buildCoverPrompt(opts);
    const taskId = await kieCreateTask(apiKey, prompt);
    const sourceUrl = await kiePollResult(apiKey, taskId);
    const bytes = await fetchBytes(sourceUrl);
    const webp = await sharp(bytes)
      .resize({ width: OUT_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    const stamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const key = `blog/covers/${stamp}-${rand}.webp`;
    const r2 = makeR2Client();
    return await uploadImageToR2(r2, bucket, key, webp, "image/webp");
  } catch (err) {
    console.error("[blog] cover generation failed:", err);
    return null;
  }
}

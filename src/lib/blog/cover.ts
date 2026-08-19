/**
 * Blog hero-image generation with Nano Banana Pro (Gemini 3 Pro Image).
 *
 * Reached through the KIE gateway — the same provider the collection-cover and
 * thumbnail-cleanup pipelines use (see scripts/generate-collection-covers.ts).
 * We create a task, poll for the result, downscale to a web-ready WebP with
 * sharp, and persist it to Cloudflare R2 (dynamic covers can't live in
 * /public, which is build-time only). Returns the public R2 URL.
 *
 * Generation is image-to-image, not text-to-image: real catalog photos of the
 * products the article features are attached as references and the prompt
 * requires them to be reproduced faithfully. Prompting from text alone produced
 * convincing photos of cases the store does not sell, which is actively harmful
 * on a page whose purpose is to sell the real ones.
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

/**
 * Build the hero prompt.
 *
 * Three constraints, in order of why they exist:
 *
 * 1. Reproduce the attached catalog photos. A text-only prompt invents a
 *    plausible but fictional case, which is worse than no image on a page
 *    whose whole job is selling the real thing.
 * 2. Accessories are part of the product, not scenery. Asking for "tasteful
 *    props (a beaded strap, stars, a pop grip)" caused the model to hang
 *    invented charms on cases that do not ship with them. A charm, grip or
 *    strap appears in the hero if and only if it is visible on that product
 *    in its reference photo.
 * 3. Photography, not CGI. Staging (angle, light, surface) is the only thing
 *    the model is free to change.
 */
function buildCoverPrompt(opts: {
  theme?: string | null;
  referenceCount: number;
}): string {
  const grounding =
    opts.referenceCount > 0
      ? [
          opts.referenceCount === 1
            ? "The attached photo shows a REAL product from this brand's catalogue."
            : `The ${opts.referenceCount} attached photos show REAL products from this brand's catalogue.`,
          "Reproduce each product EXACTLY as it appears in its reference: same case, same printed artwork and character pose, same colours, same shape.",
          "A charm, 3D decoration, dangling bead, keyring, strap, pop grip or other accessory may appear on a product ONLY when that exact piece is visible on that product in its attached photo. Copy it faithfully. If the reference shows a bare case, the generated case must also be bare.",
          "Do NOT invent, add, swap, merge or decorate with extra charms, star charms, bows, beads, keyrings, beaded straps, pop grips, or any accessory that is not in the attached photos.",
          "Do NOT redesign, restyle, recolour or substitute any product, and do NOT add extra invented cases to the scene.",
          "You may only change the camera angle, arrangement, lighting and background.",
        ].join(" ")
      : "";

  return [
    "Photorealistic editorial product photograph for a Gen-Z kawaii / Y2K phone-accessories brand.",
    grounding,
    "Staging: an elegant overhead flat-lay on an iridescent pastel-pink and lavender surface, with soft diffused studio lighting and natural soft shadows. The surface around the products is empty — no loose charms, beads, straps, grips, stars, jewellery or extra accessories used as props.",
    opts.theme ? `Editorial theme: ${opts.theme}.` : "",
    "Shot on a 50mm lens with true-to-life colours and materials, crisp focus on the products, generous clean negative space, 16:9 landscape composition.",
    "It must look like a real photograph taken in a studio — NOT a 3D render, illustration or digital painting.",
    "Absolutely NO text, letters, numbers, captions, logos or watermarks anywhere in the image.",
  ]
    .filter(Boolean)
    .join(" ");
}

async function kieCreateTask(
  apiKey: string,
  prompt: string,
  referenceImages: string[],
): Promise<string> {
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
        // Image-to-image conditioning. Omitted when empty — the gateway rejects
        // an empty array rather than treating it as "no references".
        ...(referenceImages.length > 0
          ? { image_input: referenceImages }
          : {}),
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
 *
 * `referenceImages` should be public catalog photo URLs of the products the
 * article features — see `resolveCoverReferences` in ./media.ts. Passing none
 * is supported but yields a generic scene, so callers skip generation entirely
 * when no catalog references resolve.
 */
export async function generateBlogCover(opts: {
  title: string;
  theme?: string | null;
  referenceImages?: string[];
}): Promise<string | null> {
  const apiKey = process.env.KIE_API_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!apiKey || !bucket) return null;

  const referenceImages = opts.referenceImages ?? [];

  try {
    const prompt = buildCoverPrompt({
      theme: opts.theme,
      referenceCount: referenceImages.length,
    });
    const taskId = await kieCreateTask(apiKey, prompt, referenceImages);
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
    console.error(`[blog] cover generation failed for "${opts.title}":`, err);
    return null;
  }
}

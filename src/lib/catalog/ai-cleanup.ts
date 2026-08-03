/**
 * Generative thumbnail cleanup — the "remove the hand, keep the design" path.
 *
 * Given ALL of a product's photos (the first is the primary framing reference,
 * the rest are extra angles of the SAME product), an image model reproduces the
 * product on plain white with hands/props/background removed. Passing multiple
 * references materially improves design fidelity — the model can reconstruct
 * details that are occluded or ambiguous in any single shot.
 *
 * ENGINE CHOICE:
 *   • "Nano Banana Pro" (Gemini 3 Pro Image) is a subject-preserving,
 *     multi-reference editor — the correct engine for product fidelity. Reached
 *     through the KIE gateway by default (supports up to 8 reference images).
 *   • gpt-image-1 is a TEXT-to-image model that regenerates (and can alter) the
 *     design — last-resort fallback only.
 *
 * Providers (auto-selected; override with THUMBNAIL_CLEANUP_PROVIDER):
 *   • "kie"    — Nano Banana Pro via KIE (KIE_API_KEY). Default when set.
 *   • "gemini" — Nano Banana Pro via Google direct (GEMINI_API_KEY).
 *   • "openai" — gpt-image-1 (OPENAI_API_KEY). Lower-fidelity fallback.
 *
 * Every result is a human-reviewed proposal — never auto-applied.
 * Never import from a client component — this runs Node-only code.
 */
import OpenAI, { toFile } from "openai";
import { GoogleGenAI, Modality } from "@google/genai";
import { IMAGE_MODEL } from "@/lib/social/image-gen";
import { THUMBNAIL_ASPECT } from "@/lib/catalog/normalize-thumbnail";

export type CleanupProvider = "kie" | "gemini" | "openai";
export type CleanupMode = "hand" | "artifact";

/** Max reference images to send (KIE / Nano Banana Pro accept up to 8). */
const MAX_REFERENCE_IMAGES = 8;

/** Which engine handles cleanup. Prefer the fidelity-preserving Nano Banana Pro
 *  (via KIE, then Google direct); fall back to gpt-image-1. */
export function activeCleanupProvider(): CleanupProvider {
  const pref = process.env.THUMBNAIL_CLEANUP_PROVIDER?.toLowerCase();
  if (pref === "kie" || pref === "gemini" || pref === "openai") return pref;
  if (process.env.KIE_API_KEY) return "kie";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return "openai";
}

function buildCleanupInstruction(mode: CleanupMode): string {
  const artifactLine =
    mode === "artifact"
      ? "- Remove the small physical brand tag/sticker that appears in the top-left area of some phone-case photos when it is not part of the actual design. Do not leave a visible circle, logo, badge, or sticker remnant there. That corner must be clean white unless the real product itself has a design element that truly belongs there.\n"
      : "";

  return `You are given one or more photos of the SAME physical phone case, shot from different angles or settings. The FIRST image is the primary reference for framing and proportions; the others are additional references of the same product.

Produce ONE clean product thumbnail:
- Show ONLY the phone case and everything mounted ON it (pop-grip/griptok, charms, 3D decorations, glitter). Remove the human hand, fingers, arm; the background and any surfaces; cards, packaging, and any separate dangling beaded strap or chain.
${artifactLine}- Keep the design 100% ACCURATE to the real product. Use ALL provided images together to reproduce its exact shape, colors, printed characters, artwork, patterns, and 3D details faithfully. Do NOT invent, restyle, or reinterpret the design.
- Present the case straight-on and upright, rendered LARGE and prominent so it fills most of the frame (like a premium e-commerce hero shot), fully visible and never cropped, centered on a plain solid pure white (#ffffff) background with only small even margins.
Ignore anything in the images that is not this product.`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Normalize caller input to a non-empty, capped list of image URLs. */
function refUrls(imageUrls: string[]): string[] {
  const urls = imageUrls.filter(Boolean).slice(0, MAX_REFERENCE_IMAGES);
  if (urls.length === 0) throw new Error("No reference image URLs provided.");
  return urls;
}

/**
 * Nano Banana Pro via KIE. Async task gateway that takes image URLs (not
 * binary) — our product images are already public R2 URLs, so we pass them
 * straight through. createTask → poll recordInfo → download result.
 */
const KIE_BASE = "https://api.kie.ai";

/** Create a KIE market task and return its taskId. */
async function kieCreateTask(apiKey: string, body: unknown): Promise<string> {
  const res = await fetch(`${KIE_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as {
    code?: number;
    msg?: string;
    data?: { taskId?: string };
  } | null;
  if (!res.ok || json?.code !== 200 || !json.data?.taskId) {
    throw new Error(`KIE createTask failed: ${json?.msg ?? `HTTP ${res.status}`}`);
  }
  return json.data.taskId;
}

/** Poll a KIE task until it finishes; returns the first result URL. */
async function kiePollResult(apiKey: string, taskId: string): Promise<string> {
  const deadline = Date.now() + 240_000;
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
      if (!url) throw new Error("KIE succeeded but returned no result URL.");
      return url;
    }
    if (data.state === "fail") {
      throw new Error(
        `KIE task failed: ${data.failMsg ?? data.failCode ?? "unknown error"}`,
      );
    }
    // waiting | queuing | generating → keep polling
  }
  throw new Error("KIE task timed out.");
}

/** Nano Banana Pro via KIE — subject-preserving edit (removes hand/background). */
async function cleanupWithKie(
  imageUrls: string[],
  mode: CleanupMode,
): Promise<Buffer> {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) throw new Error("KIE_API_KEY is not set.");
  const taskId = await kieCreateTask(apiKey, {
    model: "nano-banana-pro",
    input: {
      prompt: buildCleanupInstruction(mode),
      image_input: imageUrls,
      aspect_ratio: THUMBNAIL_ASPECT,
      resolution: "2K",
      output_format: "png",
    },
  });
  const url = await kiePollResult(apiKey, taskId);
  return fetchBytes(url);
}

/**
 * True (non-generative) background removal via KIE's Recraft model. It segments
 * the product and returns a transparent-background PNG — preserving the product
 * pixels EXACTLY (unlike Nano Banana Pro, which repaints). Ideal for cleaning a
 * residual gray/studio background off an already-generated thumbnail.
 */
export async function removeBackgroundKie(imageUrl: string): Promise<Buffer> {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) throw new Error("KIE_API_KEY is not set.");
  const taskId = await kieCreateTask(apiKey, {
    model: "recraft/remove-background",
    input: { image: imageUrl },
  });
  const url = await kiePollResult(apiKey, taskId);
  return fetchBytes(url);
}

/** Nano Banana Pro via Google direct (multi-image subject-preserving edit). */
async function cleanupWithGemini(
  imageUrls: string[],
  mode: CleanupMode,
): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const buffers = await Promise.all(imageUrls.map(fetchBytes));
  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_IMAGE_MODEL ?? "gemini-3-pro-image-preview";

  const res = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          ...buffers.map((b) => ({
            inlineData: { mimeType: "image/webp", data: b.toString("base64") },
          })),
          { text: buildCleanupInstruction(mode) },
        ],
      },
    ],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
      // Portrait hint; Sharp reframes to the exact target aspect afterwards.
      imageConfig: { aspectRatio: "3:4", imageSize: "2K" },
    },
  });

  const parts = res.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const data = part.inlineData?.data;
    if (data) return Buffer.from(data, "base64");
  }
  throw new Error("Nano Banana Pro returned no image data.");
}

/** gpt-image-1 fallback. LOWER FIDELITY: regenerates and can alter the design. */
async function cleanupWithOpenAI(imageUrls: string[]): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const buffers = await Promise.all(imageUrls.map(fetchBytes));
  const client = new OpenAI({ apiKey });
  const files = await Promise.all(
    buffers.map((b, i) => toFile(b, `product-${i}.webp`, { type: "image/webp" })),
  );

  const res = await client.images.edit({
    model: IMAGE_MODEL,
    image: files,
    prompt: buildCleanupInstruction("hand"),
    size: "1024x1024",
    quality: "high",
    n: 1,
  });

  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image model returned no image data.");
  return Buffer.from(b64, "base64");
}

/**
 * Remove hands/props/background from a product (given ALL its image URLs, the
 * first being the primary) and re-render it on plain white. Multiple references
 * improve design fidelity. Returns the edited image bytes.
 */
export async function removeHandsOnWhite(
  imageUrls: string[],
  mode: CleanupMode = "hand",
): Promise<Buffer> {
  const urls = refUrls(imageUrls);
  switch (activeCleanupProvider()) {
    case "kie":
      return cleanupWithKie(urls, mode);
    case "gemini":
      return cleanupWithGemini(urls, mode);
    default:
      return cleanupWithOpenAI(urls);
  }
}

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
 * Every provider is fed BYTES we read and verified ourselves — none of them is
 * ever asked to fetch our bucket. That is deliberate: the public bucket domain
 * is rate limited and a few rows point at objects that no longer exist, and both
 * used to surface as the same unactionable provider error. Resolving references
 * up front means a product with a dead photo is reported as having a dead photo,
 * and a product with nine good photos and one dead one still gets a thumbnail.
 *
 * Every result is a human-reviewed proposal — never auto-applied.
 * Never import from a client component — this runs Node-only code.
 */
import OpenAI, { toFile } from "openai";
import { GoogleGenAI, Modality } from "@google/genai";
import { IMAGE_MODEL } from "@/lib/social/image-gen";
import { THUMBNAIL_ASPECT } from "@/lib/catalog/normalize-thumbnail";
import {
  describeImageFailures,
  extensionFor,
  loadImage,
  loadImages,
  type LoadedImage,
} from "@/lib/catalog/image-source";
import {
  kieRunImageTask,
  kieUploadImage,
  kieUploadImages,
  requireKieApiKey,
} from "@/lib/catalog/kie";

export type CleanupProvider = "kie" | "gemini" | "openai";
export type CleanupMode = "hand" | "artifact";

/** Max reference images to send (KIE / Nano Banana Pro accept up to 8). */
const MAX_REFERENCE_IMAGES = 8;

/**
 * How many photos we're willing to read while looking for {@link
 * MAX_REFERENCE_IMAGES} usable ones. Reading a superset gives us slack to skip
 * dead rows without a second round of requests, and the cap keeps a 23-photo
 * product from pulling its whole gallery for eight slots.
 */
const MAX_REFERENCE_CANDIDATES = MAX_REFERENCE_IMAGES + 4;

/** Raised when not one of a product's photos could be read. Carries a message
 *  written for the operator who has to fix it, not for a log. */
export class NoUsableReferencesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoUsableReferencesError";
  }
}

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

/**
 * Turn caller-supplied URLs into verified reference images, in priority order.
 *
 * Throws {@link NoUsableReferencesError} when nothing survives — that is a
 * product-data problem the operator must fix (re-upload the photos), not a
 * transient provider error, and the message says so.
 */
async function resolveReferences(imageUrls: string[]): Promise<LoadedImage[]> {
  // Dedupe before the window is applied: a repeated URL must not consume one of
  // the eight reference slots, and it would also skew the "N of M" in the
  // failure summary against the deduped read the loader actually performs.
  const wanted = [...new Set(imageUrls.map((u) => u.trim()).filter(Boolean))];
  if (wanted.length === 0) {
    throw new NoUsableReferencesError("This product has no photos to work from.");
  }

  const candidates = wanted.slice(0, MAX_REFERENCE_CANDIDATES);
  const { images, failures } = await loadImages(candidates);

  if (images.length === 0) {
    throw new NoUsableReferencesError(
      describeImageFailures(failures, candidates.length),
    );
  }
  if (failures.length > 0) {
    console.warn(
      `[ai-cleanup] skipped ${failures.length} unusable reference(s): ${failures
        .map((f) => `${f.url} (${f.kind})`)
        .join(", ")}`,
    );
  }
  return images.slice(0, MAX_REFERENCE_IMAGES);
}

/** Name each reference so the gateway stores it with a sane extension. */
function uploadName(image: LoadedImage, index: number): string {
  return `reference-${index + 1}-${Date.now()}.${extensionFor(image)}`;
}

/** Nano Banana Pro via KIE — subject-preserving edit (removes hand/background). */
async function cleanupWithKie(
  images: LoadedImage[],
  mode: CleanupMode,
): Promise<Buffer> {
  const apiKey = requireKieApiKey();
  const hosted = await kieUploadImages(
    apiKey,
    images.map((image, i) => ({
      bytes: image.bytes,
      mime: image.mime,
      filename: uploadName(image, i),
    })),
  );

  return kieRunImageTask(apiKey, {
    model: "nano-banana-pro",
    input: {
      prompt: buildCleanupInstruction(mode),
      image_input: hosted,
      aspect_ratio: THUMBNAIL_ASPECT,
      resolution: "2K",
      output_format: "png",
    },
  });
}

/**
 * True (non-generative) background removal via KIE's Recraft model. It segments
 * the product and returns a transparent-background PNG — preserving the product
 * pixels EXACTLY (unlike Nano Banana Pro, which repaints). Ideal for cleaning a
 * residual gray/studio background off an already-generated thumbnail.
 */
export async function removeBackgroundKie(imageUrl: string): Promise<Buffer> {
  const apiKey = requireKieApiKey();
  const image = await loadImage(imageUrl);
  const hosted = await kieUploadImage(apiKey, {
    bytes: image.bytes,
    mime: image.mime,
    filename: uploadName(image, 0),
  });

  return kieRunImageTask(apiKey, {
    model: "recraft/remove-background",
    input: { image: hosted },
  });
}

/** Nano Banana Pro via Google direct (multi-image subject-preserving edit). */
async function cleanupWithGemini(
  images: LoadedImage[],
  mode: CleanupMode,
): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_IMAGE_MODEL ?? "gemini-3-pro-image-preview";

  const res = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          ...images.map((image) => ({
            inlineData: {
              mimeType: image.mime,
              data: image.bytes.toString("base64"),
            },
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
async function cleanupWithOpenAI(images: LoadedImage[]): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const client = new OpenAI({ apiKey });
  const files = await Promise.all(
    images.map((image, i) =>
      toFile(image.bytes, `product-${i}.${extensionFor(image)}`, {
        type: image.mime,
      }),
    ),
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
  const images = await resolveReferences(imageUrls);
  switch (activeCleanupProvider()) {
    case "kie":
      return cleanupWithKie(images, mode);
    case "gemini":
      return cleanupWithGemini(images, mode);
    default:
      return cleanupWithOpenAI(images);
  }
}

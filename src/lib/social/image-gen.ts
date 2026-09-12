/**
 * Social Studio — AI image generation.
 *
 * Two engines:
 *   • Nano Banana Pro (KIE) — subject-preserving image-to-image. Used whenever
 *     catalog photos are attached. gpt-image-1 still invents SKUs and plastic
 *     faces even on images.edit; this is the same engine the catalog uses to
 *     keep a case looking like the case.
 *   • gpt-image-1 — text-only generate for graphic cards, and edit fallback
 *     when KIE_API_KEY is not set.
 *
 * Results are persisted to Cloudflare R2 as WebP.
 *
 * Cost reference (gpt-image-1, USD, approx per image):
 *   1024x1024  low $0.011 · medium $0.042 · high $0.167
 *   1024x1536  low $0.016 · medium $0.063 · high $0.25
 *   1536x1024  low $0.016 · medium $0.063 · high $0.25
 */

import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { makeR2Client, uploadImageToR2 } from "@/lib/catalog/r2";
import {
  describeImageFailures,
  extensionFor,
  loadImages,
  type LoadedImage,
} from "@/lib/catalog/image-source";
import {
  kieRunImageTask,
  kieUploadImages,
} from "@/lib/catalog/kie";
import {
  MAX_PRODUCT_REFERENCE_IMAGES,
  supportsInputFidelity,
} from "@/lib/social/image-gen-policy";

export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";
export type ImageQuality = "low" | "medium" | "high";

export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
export const FASHION_IMAGE_MODEL = "nano-banana-pro";

/** Cost estimate in USD cents, keyed by `${size}:${quality}`. */
const COST_CENTS: Record<string, number> = {
  "1024x1024:low": 1.1,
  "1024x1024:medium": 4.2,
  "1024x1024:high": 16.7,
  "1024x1536:low": 1.6,
  "1024x1536:medium": 6.3,
  "1024x1536:high": 25,
  "1536x1024:low": 1.6,
  "1536x1024:medium": 6.3,
  "1536x1024:high": 25,
};

export function estimateCostCents(size: ImageSize, quality: ImageQuality): number {
  return Math.round(COST_CENTS[`${size}:${quality}`] ?? 5);
}

export type GeneratedImage = {
  imageUrl: string;
  costCents: number;
  model: string;
};

export function isImageGenConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY || process.env.KIE_API_KEY);
}

const EDITABLE_FORMATS = new Set(["jpeg", "png", "webp"]);

function kieAspect(size: ImageSize): "1:1" | "2:3" | "3:2" {
  if (size === "1024x1536") return "2:3";
  if (size === "1536x1024") return "3:2";
  return "1:1";
}

async function toEditUpload(image: LoadedImage, index: number) {
  let bytes = image.bytes;
  let format = image.format;
  let mime = image.mime;
  if (!EDITABLE_FORMATS.has(format)) {
    bytes = await sharp(image.bytes).jpeg({ quality: 92 }).toBuffer();
    format = "jpeg";
    mime = "image/jpeg";
  }
  const ext = format === "jpeg" ? "jpg" : format;
  return toFile(bytes, `catalog-${index}.${ext}`, { type: mime });
}

async function persistWebp(buffer: Buffer, keyPrefix: string): Promise<string> {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME is not set.");

  const webp = await sharp(buffer).webp({ quality: 88 }).toBuffer();
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const prefix = keyPrefix.replace(/[^a-z0-9/_-]/gi, "");
  const key = `social/${prefix}/${stamp}-${rand}.webp`;

  const r2 = makeR2Client();
  return uploadImageToR2(r2, bucket, key, webp, "image/webp");
}

function b64FromResponse(data: { b64_json?: string | null }[] | undefined): Buffer {
  const b64 = data?.[0]?.b64_json;
  if (!b64) throw new Error("Image model returned no image data.");
  return Buffer.from(b64, "base64");
}

async function editWithKie(
  images: LoadedImage[],
  prompt: string,
  size: ImageSize,
): Promise<Buffer> {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) throw new Error("KIE_API_KEY is not set.");

  const hosted = await kieUploadImages(
    apiKey,
    images.map((image, i) => ({
      bytes: image.bytes,
      mime: image.mime,
      filename: `fashion-${i}.${extensionFor(image)}`,
    })),
  );

  return kieRunImageTask(apiKey, {
    model: FASHION_IMAGE_MODEL,
    input: {
      prompt,
      image_input: hosted,
      aspect_ratio: kieAspect(size),
      resolution: "2K",
      output_format: "png",
    },
  });
}

async function editWithOpenAI(
  images: LoadedImage[],
  prompt: string,
  size: ImageSize,
  quality: ImageQuality,
): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const client = new OpenAI({ apiKey });
  const files = await Promise.all(images.map((image, i) => toEditUpload(image, i)));
  const response = await client.images.edit({
    model: IMAGE_MODEL,
    image: files,
    prompt,
    size,
    quality,
    output_format: "webp",
    n: 1,
    ...(supportsInputFidelity(IMAGE_MODEL)
      ? { input_fidelity: "high" as const }
      : {}),
  });
  return b64FromResponse(response.data);
}

/**
 * Generate one marketing image and persist it to R2.
 *
 * When `referenceImageUrls` are provided, uses image-to-image so the catalog
 * product is copied rather than invented. If `requireReferences` is true and
 * no usable photo can be read, this throws — it does not fall back to
 * text-only generation (that is how fake SKUs get posted).
 */
export async function generateMarketingImage(
  prompt: string,
  opts: {
    size?: ImageSize;
    quality?: ImageQuality;
    keyPrefix?: string;
    referenceImageUrls?: string[];
    requireReferences?: boolean;
  } = {},
): Promise<GeneratedImage> {
  const size = opts.size ?? "1024x1024";
  const quality = opts.quality ?? "medium";
  const prefix = opts.keyPrefix ?? "social";
  const refUrls = (opts.referenceImageUrls ?? []).slice(
    0,
    MAX_PRODUCT_REFERENCE_IMAGES,
  );

  if (opts.requireReferences && refUrls.length === 0) {
    throw new Error(
      "Fashion stills need a catalog photo so the case stays the real SKU. This listing has no usable product photos.",
    );
  }

  let buffer: Buffer;
  let model = IMAGE_MODEL;

  if (refUrls.length > 0) {
    const { images, failures } = await loadImages(refUrls);
    if (images.length === 0) {
      throw new Error(
        `Could not read catalog photos for this still (${describeImageFailures(failures, refUrls.length)}). Will not invent a SKU.`,
      );
    }

    const editPrompt = `${prompt}\n\nThe attached image(s) are catalog photos of the exact product. Place that product into a new photograph. Do not change its design, print, charm, colour, or accessories. The product must fill at least half the frame and stay in sharp focus.`;

    if (process.env.KIE_API_KEY) {
      buffer = await editWithKie(images, editPrompt, size);
      model = FASHION_IMAGE_MODEL;
    } else {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error("Set KIE_API_KEY (preferred) or OPENAI_API_KEY to generate stills.");
      }
      buffer = await editWithOpenAI(images, editPrompt, size, quality);
    }
  } else {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set.");
    }
    const client = new OpenAI({ apiKey });
    const response = await client.images.generate({
      model: IMAGE_MODEL,
      prompt,
      size,
      quality,
      output_format: "webp",
      n: 1,
    });
    buffer = b64FromResponse(response.data);
  }

  const imageUrl = await persistWebp(buffer, prefix);

  return {
    imageUrl,
    costCents: estimateCostCents(size, quality),
    model,
  };
}

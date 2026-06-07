/**
 * Social Studio — AI image generation (gpt-image-1).
 *
 * Generates branded marketing creatives from a text prompt and stores the
 * result in Cloudflare R2 (gpt-image-1 returns base64, never a URL, so we must
 * persist it ourselves). Returns the public URL plus a cost estimate so the
 * studio can track spend.
 *
 * Cost reference (gpt-image-1, USD, approx per image):
 *   1024x1024  low $0.011 · medium $0.042 · high $0.167
 *   1024x1536  low $0.016 · medium $0.063 · high $0.25
 *   1536x1024  low $0.016 · medium $0.063 · high $0.25
 */

import OpenAI from "openai";
import { makeR2Client, uploadImageToR2 } from "@/lib/catalog/r2";

export type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";
export type ImageQuality = "low" | "medium" | "high";

export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";

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
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Generate one marketing image and persist it to R2.
 *
 * @param prompt   Full art-direction prompt (see lib/social/presets).
 * @param opts     size / quality / keyPrefix for the R2 object key.
 */
export async function generateMarketingImage(
  prompt: string,
  opts: {
    size?: ImageSize;
    quality?: ImageQuality;
    keyPrefix?: string;
  } = {},
): Promise<GeneratedImage> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME is not set.");

  const size = opts.size ?? "1024x1024";
  const quality = opts.quality ?? "medium";

  const client = new OpenAI({ apiKey });

  const response = await client.images.generate({
    model: IMAGE_MODEL,
    prompt,
    size,
    quality,
    output_format: "webp",
    n: 1,
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image model returned no image data.");

  const buffer = Buffer.from(b64, "base64");

  // Stable, collision-resistant key under a dedicated social/ prefix.
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const prefix = (opts.keyPrefix ?? "social").replace(/[^a-z0-9/_-]/gi, "");
  const key = `social/${prefix}/${stamp}-${rand}.webp`;

  const r2 = makeR2Client();
  const imageUrl = await uploadImageToR2(r2, bucket, key, buffer, "image/webp");

  return {
    imageUrl,
    costCents: estimateCostCents(size, quality),
    model: IMAGE_MODEL,
  };
}

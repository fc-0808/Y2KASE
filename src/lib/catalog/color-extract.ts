/**
 * Dominant-color extraction from a product photo.
 *
 * The storefront filter is only as good as the attributes behind it. Titles
 * name a colour when the copywriter happened to, but most of this catalogue
 * was titled for the character, not the case. The normalized thumbnail — a
 * product on a flat white canvas — is a reliable second signal: drop the
 * canvas, histogram what remains, map hues onto the same families
 * `./colors` already uses for text.
 *
 * Sharp-only, no vision API. Deterministic, cheap, and safe to run across
 * the whole catalogue in a backfill.
 *
 * Server-only: do not import from a client component.
 */

import sharp from "sharp";
import {
  classifyColorsFromPixels,
  type ColorFamilySlug,
} from "./colors";

/** Working resolution — enough hue signal, cheap to walk. */
const SAMPLE = 48;

/**
 * Read a product image and return the color families that occupy a meaningful
 * share of the *product* (non-canvas) pixels.
 */
export async function extractColorsFromImage(
  input: Buffer,
): Promise<ColorFamilySlug[]> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize(SAMPLE, SAMPLE, { fit: "cover", withoutEnlargement: false })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels: { r: number; g: number; b: number }[] = [];
  const channels = info.channels;
  for (let i = 0; i < data.length; i += channels) {
    pixels.push({ r: data[i]!, g: data[i + 1]!, b: data[i + 2]! });
  }
  return classifyColorsFromPixels(pixels);
}

const FETCH_TIMEOUT_MS = 12_000;

/**
 * Same as {@link extractColorsFromImage} for a remote (R2) URL. Returns `[]`
 * on any network/decode failure — callers treat extraction as a hint, never
 * as a reason to abort a backfill.
 */
export async function extractColorsFromImageUrl(
  url: string,
): Promise<ColorFamilySlug[]> {
  if (!/^https?:\/\//i.test(url)) return [];
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "image/*" },
    });
    if (!response.ok) return [];
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 32) return [];
    return await extractColorsFromImage(buffer);
  } catch {
    return [];
  }
}

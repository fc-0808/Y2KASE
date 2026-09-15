/**
 * Which catalog media URLs the storefront is allowed to render.
 *
 * Two ingest generations left rows in `product_images` whose objects are gone:
 *
 *   1. Numeric-id keys: `products/{productId}/{n}.webp`. Never migrated when
 *      the bucket switched to hashed slug paths (`catalogMediaKeyBase`).
 *   2. Mojibake-collapsed prefixes: Chinese folder names run through
 *      `replace(/[^a-zA-Z0-9/_-]/g, "_")` produced near-identical underscore
 *      paths. Two of those prefixes have no objects (HeadObject NotFound);
 *      neighbouring prefixes with a different underscore run still resolve, so
 *      we match the dead prefixes exactly rather than "any underscore folder".
 *
 * Asking the public bucket for a dozen 404s on every product page also contends
 * with the one object that *does* exist (the approved thumbnail), which is why
 * a desktop viewport that eagerly paints the whole strip can blank the hero
 * while a mobile viewport (fewer in-view thumbs) still shows it.
 *
 * This module is deliberately client-safe: no Node, no Sharp, no S3. The PDP
 * and listing cards share the same predicate so a URL that is retired never
 * reaches an `<img>` or `<video>`.
 */

import { canonicalizePublicR2Url } from "./r2-public";

/** Pathname of the retired numeric-id ingest keys. */
const RETIRED_NUMERIC_OBJECT =
  /\/products\/\d+\/\d+\.(?:webp|jpe?g|png|gif)$/i;

/**
 * Exact object prefixes whose entire tree is missing from R2.
 * Confirmed by HeadObject across the active catalogue (2026-09-12).
 */
const RETIRED_OBJECT_PREFIXES = [
  "/products/________________13_____12____15-17pm__plusair_variants/",
  "/products/__________________13_____12____15-17pm__plusair_variants/",
] as const;

export function isCatalogHttpUrl(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.startsWith("https://") || trimmed.startsWith("http://");
}

function catalogPathname(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/**
 * True when `url` points at a retired object that is known not to exist in
 * the bucket. Invalid URLs are treated as retired so they never render.
 */
export function isRetiredCatalogObjectUrl(url: string): boolean {
  const pathname = catalogPathname(url);
  if (!pathname) return true;
  if (RETIRED_NUMERIC_OBJECT.test(pathname)) return true;
  return RETIRED_OBJECT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** True when the storefront should emit this URL as an `<img>` / `<video>` src. */
export function isStorefrontRenderableUrl(
  url: string | null | undefined,
): url is string {
  if (!url || !isCatalogHttpUrl(url)) return false;
  return !isRetiredCatalogObjectUrl(url);
}

/**
 * Drop retired / non-HTTP rows, preserving gallery order. Idempotent.
 */
export function selectStorefrontImages<T extends { url: string }>(
  images: readonly T[],
): T[] {
  return images.filter((image) => isStorefrontRenderableUrl(image.url));
}

/** First renderable gallery URL, or null when the product has no live photo. */
export function storefrontHeroUrl(
  images: readonly { url: string | null | undefined }[],
): string | null {
  for (const image of images) {
    if (isStorefrontRenderableUrl(image.url)) {
      return canonicalizePublicR2Url(image.url);
    }
  }
  return null;
}

/** Product video, or null when the file is a retired / non-HTTP URL. */
export function storefrontVideoUrl(
  url: string | null | undefined,
): string | null {
  return isStorefrontRenderableUrl(url) ? canonicalizePublicR2Url(url) : null;
}

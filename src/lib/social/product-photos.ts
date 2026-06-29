/**
 * Social Studio — import real product photos as creatives.
 *
 * Instead of generating synthetic imagery, this path turns the catalog's
 * existing product photos (already uploaded to the public R2 bucket during
 * catalog ingest) into social creatives. This is the approach top DTC brands
 * use for evergreen catalog distribution: the asset shoppers see on the pin is
 * the exact product they'll receive — no misrepresentation, zero generation
 * cost, and the photos are already optimised and publicly reachable over HTTPS
 * (which is what the Pinterest createPin API requires).
 *
 * Each selected photo becomes a `draft` social_creative that flows through the
 * same review → publish → analytics pipeline as AI creatives.
 */

import { db, isDbConfigured } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { insertCreative } from "@/lib/social/creatives";
import { generateCaption } from "@/lib/social/caption-gen";
import type { SocialPlatform } from "@/lib/social/presets";

/** Synthetic preset key marking a creative sourced from a real product photo. */
export const PRODUCT_PHOTO_PRESET = "product_photo";

export type ProductPhoto = {
  id: number;
  url: string;
  altText: string | null;
  position: number;
};

export type ProductGallery = {
  id: number;
  title: string;
  slug: string;
  productType: string;
  description: string | null;
  tags: string[];
  videoUrl: string | null;
  photos: ProductPhoto[];
};

/**
 * Fetch a product's ordered photo gallery (public R2 URLs) for the import
 * picker. Returns null when the product doesn't exist.
 */
export async function getProductGallery(
  productId: number,
): Promise<ProductGallery | null> {
  if (!isDbConfigured()) return null;
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    with: {
      images: { orderBy: (img, { asc }) => asc(img.position) },
    },
  });
  if (!product) return null;

  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    productType: product.productType,
    description: product.description,
    tags: product.tags ?? [],
    videoUrl: product.videoUrl,
    photos: (product.images ?? []).map((img) => ({
      id: img.id,
      url: img.url,
      altText: img.altText,
      position: img.position,
    })),
  };
}

export type ImportPhotosInput = {
  productId: number;
  /** R2 URLs of the photos to turn into creatives. */
  imageUrls: string[];
  platform?: SocialPlatform;
  /** When true, draft a platform caption with the text model (cheap). */
  withCaption?: boolean;
};

export type ImportPhotosResult =
  | { ok: true; created: number }
  | { ok: false; error: string };

/**
 * Create draft creatives from a product's real photos.
 *
 * Generates a single shared caption for the product (the text model only needs
 * product context, not per-image), then applies it to every selected photo so
 * the operator gets ready-to-review drafts. Caption generation is best-effort:
 * a failure still produces drafts (copy is editable in the studio).
 */
export async function importProductPhotos(
  input: ImportPhotosInput,
): Promise<ImportPhotosResult> {
  const urls = Array.from(
    new Set(input.imageUrls.map((u) => u.trim()).filter(Boolean)),
  );
  if (urls.length === 0) {
    return { ok: false, error: "Select at least one photo." };
  }
  if (urls.length > 30) {
    return { ok: false, error: "Pick 30 photos or fewer per import." };
  }

  const gallery = await getProductGallery(input.productId);
  if (!gallery) return { ok: false, error: "Product not found." };

  // Only allow URLs that actually belong to this product (defence in depth),
  // and resolve each to its catalog image id so the creative is linked to its
  // source photo (the dedup key the auto-pin drip relies on).
  const urlToImageId = new Map(gallery.photos.map((p) => [p.url, p.id]));
  const valid = urls.filter((u) => urlToImageId.has(u));
  if (valid.length === 0) {
    return { ok: false, error: "None of the selected photos belong to this product." };
  }

  const platform = input.platform ?? "pinterest";

  // One caption for the product, reused across its selected photos.
  let caption = "";
  let hashtags: string[] = [];
  if (input.withCaption) {
    try {
      const copy = await generateCaption({
        productTitle: gallery.title,
        productType: gallery.productType,
        description: gallery.description,
        tags: gallery.tags,
        platform,
        preset: PRODUCT_PHOTO_PRESET,
      });
      caption = copy.caption;
      hashtags = copy.hashtags;
    } catch (err) {
      console.error("[social] caption generation failed for photo import:", err);
    }
  }

  let created = 0;
  for (const url of valid) {
    try {
      await insertCreative({
        productId: gallery.id,
        productTitle: gallery.title,
        productSlug: gallery.slug,
        sourceImageId: urlToImageId.get(url) ?? null,
        preset: PRODUCT_PHOTO_PRESET,
        platform,
        imageUrl: url,
        prompt: "(real product photo — no generation)",
        caption,
        hashtags,
        model: "product-photo",
        costCents: 0,
      });
      created += 1;
    } catch (err) {
      console.error("[social] failed to insert photo creative:", err);
    }
  }

  if (created === 0) {
    return { ok: false, error: "Failed to import photos." };
  }
  return { ok: true, created };
}

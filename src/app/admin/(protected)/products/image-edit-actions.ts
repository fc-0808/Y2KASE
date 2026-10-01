"use server";

/**
 * Crop and restore a catalog photo.
 *
 * R2 objects are immutable, so a crop uploads a new WebP and points
 * `product_images.url` at it. The first URL is stored once in `original_url`
 * and is never overwritten: Undo always returns the photo that was ingested,
 * however many crops came after. Intermediate crops are deleted; the original
 * object is not.
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { revalidateStorefrontProduct } from "@/lib/cache";
import { CropGeometryError } from "@/lib/catalog/crop-geometry";
import { renderListingCrop } from "@/lib/catalog/image-edit";
import { ImageUnavailableError, loadImage } from "@/lib/catalog/image-source";
import { fingerprintFromBuffer } from "@/lib/catalog/phash";
import {
  deleteObjectsFromR2,
  makeR2Client,
  r2KeyFromUrl,
  uploadWebpToR2,
} from "@/lib/catalog/r2";
import { db } from "@/lib/db";
import { productImages, products } from "@/lib/db/schema";

/** Keys we are allowed to delete. Ingested originals live outside this prefix. */
const EDIT_KEY_PREFIX = "products/edits/";

export type CatalogImageEdit =
  | {
      ok: true;
      changed: boolean;
      url: string;
      originalUrl: string | null;
      width: number;
      height: number;
      message: string;
    }
  | { ok: false; message: string };

function fail(message: string): CatalogImageEdit {
  return { ok: false, message };
}

function validId(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

function editKeyFor(url: string): string | null {
  const key = r2KeyFromUrl(url);
  if (!key || !key.startsWith(EDIT_KEY_PREFIX)) return null;
  return key;
}

/** Best-effort. An orphaned intermediate is preferable to failing a finished crop. */
async function discardEdit(url: string): Promise<void> {
  const key = editKeyFor(url);
  if (!key) return;
  try {
    const bucket = process.env.R2_BUCKET_NAME;
    if (!bucket) return;
    await deleteObjectsFromR2(makeR2Client(), bucket, [key]);
  } catch (err) {
    console.error("[image-edit] could not delete intermediate crop", err);
  }
}

async function revalidateListing(productId: number): Promise<void> {
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products");
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { slug: true },
  });
  if (product?.slug) revalidateStorefrontProduct(product.slug);
}

function reason(err: unknown): string {
  if (err instanceof CropGeometryError) return err.message;
  if (err instanceof ImageUnavailableError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Could not update this photo.";
}

export async function cropCatalogImage(input: {
  productId: number;
  imageId: number;
  left: number;
  top: number;
  width: number;
  height: number;
  rotate: number;
}): Promise<CatalogImageEdit> {
  const session = await requireAdmin(await headers());
  if (!session) return fail("Not authorized.");
  if (!validId(input.productId) || !validId(input.imageId)) {
    return fail("That photo could not be found.");
  }
  for (const n of [input.left, input.top, input.width, input.height, input.rotate]) {
    if (!Number.isFinite(n)) return fail("That crop is not a valid rectangle.");
  }

  const row = await db.query.productImages.findFirst({
    where: and(
      eq(productImages.id, input.imageId),
      eq(productImages.productId, input.productId),
    ),
    columns: { id: true, url: true, originalUrl: true },
  });
  if (!row) return fail("That photo could not be found.");

  let rendered;
  try {
    const source = await loadImage(row.url);
    rendered = await renderListingCrop(source.bytes, input);
  } catch (err) {
    return fail(reason(err));
  }

  if (!rendered.changed) {
    return {
      ok: true,
      changed: false,
      url: row.url,
      originalUrl: row.originalUrl,
      width: rendered.width,
      height: rendered.height,
      message: "That selection is the whole photo, so nothing was rewritten.",
    };
  }

  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) return fail("Photo storage is not configured.");

  const key = `${EDIT_KEY_PREFIX}${input.productId}/${input.imageId}-${Date.now()}.webp`;
  let uploaded: string | null = null;
  try {
    uploaded = await uploadWebpToR2(makeR2Client(), bucket, key, rendered.bytes);
    const phash = await fingerprintFromBuffer(rendered.bytes);
    const preserved = row.originalUrl ?? row.url;
    await db
      .update(productImages)
      .set({ url: uploaded, originalUrl: preserved, phash })
      .where(
        and(
          eq(productImages.id, input.imageId),
          eq(productImages.productId, input.productId),
        ),
      );
  } catch (err) {
    if (uploaded) await discardEdit(uploaded);
    return fail(reason(err));
  }

  if (row.url !== (row.originalUrl ?? row.url)) await discardEdit(row.url);
  await revalidateListing(input.productId);

  return {
    ok: true,
    changed: true,
    url: uploaded,
    originalUrl: row.originalUrl ?? row.url,
    width: rendered.width,
    height: rendered.height,
    message: `Cropped to ${rendered.width}×${rendered.height}.`,
  };
}

export async function restoreCatalogImage(input: {
  productId: number;
  imageId: number;
}): Promise<CatalogImageEdit> {
  const session = await requireAdmin(await headers());
  if (!session) return fail("Not authorized.");
  if (!validId(input.productId) || !validId(input.imageId)) {
    return fail("That photo could not be found.");
  }

  const row = await db.query.productImages.findFirst({
    where: and(
      eq(productImages.id, input.imageId),
      eq(productImages.productId, input.productId),
    ),
    columns: { id: true, url: true, originalUrl: true },
  });
  if (!row) return fail("That photo could not be found.");
  if (!row.originalUrl || row.originalUrl === row.url) {
    return fail("This photo has no stored original.");
  }

  let width = 0;
  let height = 0;
  let phash: string | null = null;
  try {
    const source = await loadImage(row.originalUrl);
    width = source.width;
    height = source.height;
    phash = await fingerprintFromBuffer(source.bytes);
  } catch (err) {
    return fail(reason(err));
  }

  try {
    await db
      .update(productImages)
      .set({ url: row.originalUrl, originalUrl: null, phash })
      .where(
        and(
          eq(productImages.id, input.imageId),
          eq(productImages.productId, input.productId),
        ),
      );
  } catch (err) {
    return fail(reason(err));
  }

  await discardEdit(row.url);
  await revalidateListing(input.productId);

  return {
    ok: true,
    changed: true,
    url: row.originalUrl,
    originalUrl: null,
    width,
    height,
    message: "Restored the uploaded photo.",
  };
}

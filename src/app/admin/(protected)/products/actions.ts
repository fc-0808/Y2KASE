"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  products,
  productImages,
  productOptions,
  productCollections,
} from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import {
  MODEL_OPTION_NAME,
  STYLE_OPTION_NAME,
  STYLES,
  IPHONE_MODELS,
  orderStyles,
  orderModels,
  stylesForAddons,
  defaultStyleFor,
  getStylePrice,
} from "@/lib/pricing";
import { saveProductVariations } from "@/lib/admin/product-variations";
import {
  makeR2Client,
  deleteObjectsFromR2,
  r2KeyFromUrl,
} from "@/lib/catalog/r2";
import { productTypeLabel } from "@/lib/catalog/product-types";

const VALID_STYLES = new Set<string>(STYLES);
const VALID_MODELS = new Set<string>(IPHONE_MODELS);

/** Re-prime every surface a catalog change can affect. */
function revalidateCatalog(productId?: number) {
  if (productId != null) revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products");
  revalidatePath("/products");
  // Product detail pages are ISR-cached per slug; invalidate the whole dynamic
  // route so edited media/variations/availability appear immediately rather
  // than after the hourly ISR window. (Dynamic segment → requires `type`.)
  revalidatePath("/products/[slug]", "page");
  revalidatePath("/collections");
  revalidatePath("/collections/[slug]", "page");
  revalidatePath("/");
}

// ─────────────────────────────────────────────────────────────────────────────
// Collection membership (browse taxonomy)
//
// Assign or unassign many products to a collection in one batch. Membership is
// idempotent — adding an existing pairing is a no-op. Any product type can
// belong to any collection (collections are marketing groupings, orthogonal to
// the functional productType).
// ─────────────────────────────────────────────────────────────────────────────

export type CollectionAssignResult = {
  ok: boolean;
  message: string;
  changed: number;
};

export async function assignProductsToCollection(
  productIds: number[],
  collectionId: number,
): Promise<CollectionAssignResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized.", changed: 0 };
  }
  const ids = Array.from(new Set(productIds)).filter((n) => Number.isFinite(n));
  if (ids.length === 0 || !Number.isFinite(collectionId)) {
    return { ok: false, message: "Nothing to assign.", changed: 0 };
  }

  await db
    .insert(productCollections)
    .values(ids.map((productId) => ({ productId, collectionId })))
    .onConflictDoNothing();

  revalidateCatalog();
  return {
    ok: true,
    message: `Added ${ids.length} product${ids.length === 1 ? "" : "s"} to collection.`,
    changed: ids.length,
  };
}

export async function removeProductsFromCollection(
  productIds: number[],
  collectionId: number,
): Promise<CollectionAssignResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized.", changed: 0 };
  }
  const ids = Array.from(new Set(productIds)).filter((n) => Number.isFinite(n));
  if (ids.length === 0 || !Number.isFinite(collectionId)) {
    return { ok: false, message: "Nothing to remove.", changed: 0 };
  }

  await db
    .delete(productCollections)
    .where(
      and(
        eq(productCollections.collectionId, collectionId),
        inArray(productCollections.productId, ids),
      ),
    );

  revalidateCatalog();
  return {
    ok: true,
    message: `Removed ${ids.length} product${ids.length === 1 ? "" : "s"} from collection.`,
    changed: ids.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Single-product lifecycle actions
//
// These are reachable as direct POST requests, so each independently verifies
// the caller is an admin (defense-in-depth — we never rely on the layout guard
// or proxy alone; see src/lib/auth.ts).
// ─────────────────────────────────────────────────────────────────────────────

export async function publishProduct(id: number) {
  if (!(await requireAdmin(await headers()))) return;
  await db
    .update(products)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(products.id, id));
  revalidateCatalog(id);
}

export async function unpublishProduct(id: number) {
  if (!(await requireAdmin(await headers()))) return;
  await db
    .update(products)
    .set({ status: "draft", updatedAt: new Date() })
    .where(eq(products.id, id));
  revalidateCatalog(id);
}

export async function setFeatured(id: number, featured: boolean) {
  if (!(await requireAdmin(await headers()))) return;
  await db
    .update(products)
    .set({ featured, updatedAt: new Date() })
    .where(eq(products.id, id));
  revalidateCatalog(id);
}

export async function deleteProduct(id: number) {
  if (!(await requireAdmin(await headers()))) return;
  await deleteProductsAndMedia([id]);
  revalidateCatalog();
}

export type BulkDeleteResult = {
  ok: boolean;
  message: string;
  deleted: number;
};

/**
 * Permanently delete many products at once. Child rows (images, options,
 * variants) cascade automatically; the underlying R2 media is cleaned up on a
 * best-effort basis so the bucket doesn't accumulate orphans.
 */
export async function bulkDeleteProducts(
  ids: number[],
): Promise<BulkDeleteResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized.", deleted: 0 };
  }
  const wanted = Array.from(new Set(ids)).filter((n) => Number.isFinite(n));
  if (wanted.length === 0) {
    return { ok: false, message: "No products selected.", deleted: 0 };
  }

  const deleted = await deleteProductsAndMedia(wanted);
  revalidateCatalog();

  return {
    ok: true,
    message: `Deleted ${deleted} product${deleted === 1 ? "" : "s"}.`,
    deleted,
  };
}

/**
 * Core delete: removes the product rows (children cascade) and then makes a
 * best-effort pass to purge their R2 media. R2 failures are logged but never
 * block the delete — an orphaned file is far less harmful than a half-deleted
 * catalog record, and orphans can be garbage-collected separately.
 */
async function deleteProductsAndMedia(ids: number[]): Promise<number> {
  const rows = await db.query.products.findMany({
    where: inArray(products.id, ids),
    columns: { id: true, videoUrl: true },
    with: { images: { columns: { url: true } } },
  });
  if (rows.length === 0) return 0;

  await db.delete(products).where(inArray(products.id, ids));

  try {
    const bucket = process.env.R2_BUCKET_NAME;
    if (bucket) {
      const keys: string[] = [];
      for (const row of rows) {
        for (const img of row.images) {
          const key = r2KeyFromUrl(img.url);
          if (key) keys.push(key);
        }
        if (row.videoUrl) {
          const key = r2KeyFromUrl(row.videoUrl);
          if (key) keys.push(key);
        }
      }
      if (keys.length > 0) {
        const r2 = makeR2Client();
        await deleteObjectsFromR2(r2, bucket, keys);
      }
    }
  } catch (err) {
    console.error(
      "[deleteProducts] R2 media cleanup failed (orphaned files left behind):",
      err instanceof Error ? err.message : err,
    );
  }

  return rows.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk variation editor
//
// Applies a Style add-on choice and/or an iPhone-model selection across many
// products in one transaction-like batch. Only iPhone-case products carry these
// axes, so other product types are silently skipped (and reported).
// ─────────────────────────────────────────────────────────────────────────────

/** How the operator chose the offered styles in the bulk editor. */
export type BulkStyleUpdate =
  | { mode: "addons"; hasGrip: boolean; hasCharm: boolean }
  | { mode: "manual"; styles: string[] };

export type BulkUpdatePayload = {
  productIds: number[];
  /** When present, overwrites each product's offered Style set + base price. */
  styles?: BulkStyleUpdate;
  /** When present, overwrites each product's offered iPhone Model set. */
  models?: string[];
  /** When present, publishes (active) or unpublishes (draft) the selection. */
  status?: "active" | "draft";
};

export type BulkUpdateResult = {
  ok: boolean;
  message: string;
  updated: number;
  skipped: number;
};

/** Resolve the canonical, price-ordered style set from the editor's choice. */
function resolveStyles(update: BulkStyleUpdate): string[] {
  if (update.mode === "addons") {
    return stylesForAddons({
      hasGrip: update.hasGrip,
      hasCharm: update.hasCharm,
    });
  }
  const cleaned = update.styles.filter((s) => VALID_STYLES.has(s));
  // "Case Only" is mandatory — every product ships with a bare case.
  const withCase = cleaned.includes("Case Only")
    ? cleaned
    : [...cleaned, "Case Only"];
  return orderStyles(withCase);
}

/** Insert or update a single named option axis for one product. */
async function upsertOption(
  productId: number,
  name: string,
  values: string[],
  existing: { id: number; name: string }[],
  positionFallback: number,
) {
  const match = existing.find((o) => o.name === name);
  if (match) {
    await db
      .update(productOptions)
      .set({ values })
      .where(eq(productOptions.id, match.id));
  } else {
    await db.insert(productOptions).values({
      productId,
      name,
      position: positionFallback,
      values,
    });
  }
}

export async function bulkUpdateProducts(
  payload: BulkUpdatePayload,
): Promise<BulkUpdateResult> {
  const session = await requireAdmin(await headers());
  if (!session) {
    return { ok: false, message: "Not authorized.", updated: 0, skipped: 0 };
  }

  const ids = Array.from(new Set(payload.productIds)).filter((n) =>
    Number.isFinite(n),
  );
  if (ids.length === 0) {
    return { ok: false, message: "No products selected.", updated: 0, skipped: 0 };
  }

  const wantsStyles = payload.styles != null;
  const wantsModels = payload.models != null;
  const wantsStatus = payload.status != null;
  if (!wantsStyles && !wantsModels && !wantsStatus) {
    return { ok: false, message: "Nothing to apply.", updated: 0, skipped: 0 };
  }

  // ── Validate the requested variation sets up front ────────────────────────
  const targetStyles = wantsStyles ? resolveStyles(payload.styles!) : null;
  const targetModels = wantsModels
    ? orderModels(payload.models!.filter((m) => VALID_MODELS.has(m)))
    : null;
  if (wantsModels && (!targetModels || targetModels.length === 0)) {
    return {
      ok: false,
      message: "Select at least one iPhone model.",
      updated: 0,
      skipped: 0,
    };
  }

  const rows = await db.query.products.findMany({
    where: inArray(products.id, ids),
    columns: { id: true, currency: true, productType: true },
    with: {
      images: { columns: { id: true, styleTags: true } },
      options: { columns: { id: true, name: true } },
    },
  });

  let updated = 0;
  let skipped = 0;

  for (const product of rows) {
    // Status changes apply to any product type.
    if (wantsStatus) {
      await db
        .update(products)
        .set({ status: payload.status!, updatedAt: new Date() })
        .where(eq(products.id, product.id));
    }

    // Style/model axes only exist on phone cases.
    const isIphoneCase = product.productType === "iphone_case";
    if ((wantsStyles || wantsModels) && !isIphoneCase) {
      skipped += 1;
      if (!wantsStatus) continue;
    }

    if (isIphoneCase && wantsStyles && targetStyles) {
      const allowed = new Set(targetStyles);
      await upsertOption(
        product.id,
        STYLE_OPTION_NAME,
        targetStyles,
        product.options,
        product.options.length,
      );
      // Base "from" price follows the cheapest offered style.
      await db
        .update(products)
        .set({
          price: String(
            getStylePrice(defaultStyleFor(targetStyles), product.currency),
          ),
          updatedAt: new Date(),
        })
        .where(eq(products.id, product.id));
      // Drop any per-image style tags that are no longer offered.
      await Promise.all(
        product.images
          .filter((img) => (img.styleTags ?? []).some((s) => !allowed.has(s)))
          .map((img) =>
            db
              .update(productImages)
              .set({
                styleTags: (img.styleTags ?? []).filter((s) => allowed.has(s)),
              })
              .where(eq(productImages.id, img.id)),
          ),
      );
    }

    if (isIphoneCase && wantsModels && targetModels) {
      await upsertOption(
        product.id,
        MODEL_OPTION_NAME,
        targetModels,
        product.options,
        product.options.length,
      );
    }

    updated += 1;
  }

  revalidateCatalog();

  const parts: string[] = [];
  if (wantsStatus) parts.push(payload.status === "active" ? "published" : "unpublished");
  if (wantsStyles) parts.push("styles");
  if (wantsModels) parts.push("models");
  const what = parts.join(" + ");
  const skipNote = skipped > 0 ? ` (${skipped} non-case skipped)` : "";

  return {
    ok: true,
    message: `Updated ${what} on ${updated} product${updated === 1 ? "" : "s"}${skipNote}.`,
    updated,
    skipped,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-product bulk workspace
//
// The "Edit individually" mode loads the full editable state for the selected
// products on demand (so the catalog list itself stays light), lets the
// operator curate each product's media order, per-image style tags, styles and
// models independently, then commits everything in one Save All.
// ─────────────────────────────────────────────────────────────────────────────

/** One image in the per-product editor. */
export type BulkEditImage = {
  id: number;
  url: string;
  filename: string | null;
  styleTags: string[];
};

/** Everything the per-product editor needs to render and edit one product. */
export type BulkEditProduct = {
  id: number;
  title: string;
  slug: string;
  status: string;
  productType: string;
  productTypeLabel: string;
  currency: string;
  videoUrl: string | null;
  videoPosition: number | null;
  images: BulkEditImage[];
  availableStyles: string[];
  availableModels: string[];
};

/** A single product's curated state, sent back to {@link bulkSaveProducts}. */
export type PerProductSave = {
  productId: number;
  imageOrder: number[];
  videoSlot: number | null;
  styleTags: Record<number, string[]>;
  availableStyles: string[];
  availableModels: string[];
};

export type BulkSaveResult = {
  ok: boolean;
  message: string;
  saved: number;
  failed: { productId: number; message: string }[];
};

/**
 * Load the full editable state for a set of products. Admin-guarded; returns
 * results in the same priority order the list uses (drafts feel "first").
 */
export async function getBulkEditProducts(
  ids: number[],
): Promise<BulkEditProduct[]> {
  const session = await requireAdmin(await headers());
  if (!session) return [];

  const wanted = Array.from(new Set(ids)).filter((n) => Number.isFinite(n));
  if (wanted.length === 0) return [];

  const rows = await db.query.products.findMany({
    where: inArray(products.id, wanted),
    columns: {
      id: true,
      title: true,
      slug: true,
      status: true,
      currency: true,
      productType: true,
      videoUrl: true,
      videoPosition: true,
    },
    with: {
      images: {
        columns: {
          id: true,
          url: true,
          sourceFilename: true,
          styleTags: true,
        },
        orderBy: (img, { asc }) => asc(img.position),
      },
      options: { columns: { name: true, values: true } },
    },
  });

  return rows.map((p): BulkEditProduct => {
    const styleOpt = p.options.find((o) => o.name === STYLE_OPTION_NAME);
    const modelOpt = p.options.find((o) => o.name === MODEL_OPTION_NAME);
    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      status: p.status,
      productType: p.productType,
      productTypeLabel: productTypeLabel(p.productType),
      currency: p.currency,
      videoUrl: p.videoUrl,
      videoPosition: p.videoPosition,
      images: p.images.map((i) => ({
        id: i.id,
        url: i.url,
        filename: i.sourceFilename,
        styleTags: i.styleTags ?? [],
      })),
      availableStyles: orderStyles(styleOpt?.values ?? []),
      availableModels: orderModels(modelOpt?.values ?? []),
    };
  });
}

/**
 * Commit per-product edits for many products in one call. Each product is
 * saved independently so one bad record can't roll back the rest; failures are
 * reported back to the UI. Caches are revalidated once at the end.
 */
export async function bulkSaveProducts(
  items: PerProductSave[],
): Promise<BulkSaveResult> {
  const session = await requireAdmin(await headers());
  if (!session) {
    return { ok: false, message: "Not authorized.", saved: 0, failed: [] };
  }
  if (items.length === 0) {
    return { ok: false, message: "No changes to save.", saved: 0, failed: [] };
  }

  let saved = 0;
  const failed: { productId: number; message: string }[] = [];

  for (const item of items) {
    try {
      const res = await saveProductVariations({
        productId: item.productId,
        imageOrder: item.imageOrder,
        videoSlot: item.videoSlot,
        styleTags: item.styleTags,
        availableStyles: item.availableStyles,
        availableModels: item.availableModels,
      });
      if (res.ok) saved += 1;
      else failed.push({ productId: item.productId, message: res.message });
    } catch (err) {
      failed.push({
        productId: item.productId,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  revalidateCatalog();

  const ok = failed.length === 0;
  const message = ok
    ? `Saved ${saved} product${saved === 1 ? "" : "s"}.`
    : `Saved ${saved}, ${failed.length} failed.`;
  return { ok, message, saved, failed };
}

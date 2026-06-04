/**
 * Shared, server-only mutation core for the admin "Media & Variations" surface.
 *
 * Both the single-product editor (`/admin/products/[id]`) and the bulk editor
 * (`/admin/products` → Edit individually) persist the exact same shape of
 * change: a curated media order, per-image style tags, the video slot, the
 * offered Style set (which drives the base price) and — optionally — the
 * offered iPhone Model set. Centralizing it here guarantees both paths behave
 * identically and stay correct as the rules evolve.
 *
 * This module is server-only (it imports the DB). It does NOT perform auth or
 * cache revalidation — callers (Server Actions) own those concerns so a bulk
 * save can authenticate once and revalidate once.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, productImages, productOptions } from "@/lib/db/schema";
import {
  STYLE_OPTION_NAME,
  MODEL_OPTION_NAME,
  STYLES,
  IPHONE_MODELS,
  orderStyles,
  orderModels,
  defaultStyleFor,
  getStylePrice,
} from "@/lib/pricing";

const VALID_STYLES = new Set<string>(STYLES);
const VALID_MODELS = new Set<string>(IPHONE_MODELS);

export type SaveVariationsInput = {
  productId: number;
  /** Image ids in their new display order (top → bottom). */
  imageOrder: number[];
  /** 0-based slot the video occupies among the images. Null = no video slot. */
  videoSlot: number | null;
  /** imageId → applicable styles. `[]` means universal (shown for every style). */
  styleTags: Record<number, string[]>;
  /** The styles this product offers (drives the Style option + base price). */
  availableStyles: string[];
  /**
   * The iPhone models this product is sold for. Omit to leave the Model axis
   * untouched (the single editor doesn't manage models today).
   */
  availableModels?: string[];
};

export type SaveVariationsResult = { ok: boolean; message: string };

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(n, max));
}

/** Insert or update one named option axis, appending at the end if new. */
async function upsertOption(
  productId: number,
  name: string,
  values: string[],
) {
  const existing = await db.query.productOptions.findFirst({
    where: and(
      eq(productOptions.productId, productId),
      eq(productOptions.name, name),
    ),
    columns: { id: true },
  });
  if (existing) {
    await db
      .update(productOptions)
      .set({ values })
      .where(eq(productOptions.id, existing.id));
    return;
  }
  const all = await db.query.productOptions.findMany({
    where: eq(productOptions.productId, productId),
    orderBy: asc(productOptions.position),
    columns: { position: true },
  });
  await db.insert(productOptions).values({
    productId,
    name,
    position: all.length,
    values,
  });
}

/**
 * Persist media order, per-image style tags, the video slot, the offered Style
 * set (+ base price) and optionally the offered iPhone Model set for a single
 * product. Returns a per-product result so bulk callers can report partial
 * failures without aborting the whole batch.
 */
export async function saveProductVariations(
  input: SaveVariationsInput,
): Promise<SaveVariationsResult> {
  const { productId } = input;

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { id: true, currency: true, videoUrl: true, productType: true },
    with: { images: { columns: { id: true } } },
  });
  if (!product) return { ok: false, message: `#${productId}: not found.` };

  const isIphoneCase = product.productType === "iphone_case";

  // ── Validate the image set matches what's on the product ──────────────────
  const ownedIds = new Set(product.images.map((i) => i.id));
  const orderIds = input.imageOrder.filter((id) => ownedIds.has(id));
  if (orderIds.length !== ownedIds.size) {
    return {
      ok: false,
      message: `#${productId}: image list out of sync — reload and retry.`,
    };
  }

  // ── Normalize the offered styles to the canonical, price-ordered set ──────
  const availableStyles = orderStyles(input.availableStyles);
  const styles = availableStyles.length > 0 ? availableStyles : ["Case Only"];
  const allowed = new Set<string>(styles);

  // ── 1. Image positions + style tags ───────────────────────────────────────
  await Promise.all(
    orderIds.map((id, index) => {
      const tags = (input.styleTags[id] ?? []).filter(
        (s) => VALID_STYLES.has(s) && allowed.has(s),
      );
      return db
        .update(productImages)
        .set({ position: index, styleTags: tags })
        .where(eq(productImages.id, id));
    }),
  );

  // ── 2. Video slot (+ base "from" price for phone cases) ───────────────────
  const videoSlot = product.videoUrl
    ? clamp(input.videoSlot ?? 1, 0, orderIds.length)
    : null;
  const productUpdate: {
    videoPosition: number | null;
    price?: string;
    updatedAt: Date;
  } = { videoPosition: videoSlot, updatedAt: new Date() };
  if (isIphoneCase) {
    productUpdate.price = String(
      getStylePrice(defaultStyleFor(styles), product.currency),
    );
  }
  await db.update(products).set(productUpdate).where(eq(products.id, productId));

  // ── 3. Variation axes (phone cases only) ──────────────────────────────────
  if (isIphoneCase) {
    await upsertOption(productId, STYLE_OPTION_NAME, styles);

    if (input.availableModels) {
      const models = orderModels(
        input.availableModels.filter((m) => VALID_MODELS.has(m)),
      );
      // A product must always offer at least one model; ignore empty sets.
      if (models.length > 0) {
        await upsertOption(productId, MODEL_OPTION_NAME, models);
      }
    }
  }

  return { ok: true, message: "Saved." };
}

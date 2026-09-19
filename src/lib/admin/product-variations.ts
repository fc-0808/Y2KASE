/**
 * Shared, server-only mutation core for the admin "Media & Variations" surface.
 *
 * Both the single-product editor (`/admin/products/[id]`) and the bulk editor
 * (`/admin/products` → Edit individually) persist the exact same shape of
 * change: a curated media order, per-image style tags, the video slot, the
 * offered Style set (which drives the base price), optional custom variations
 * for multi-product listings, and — optionally — the offered compatibility
 * set (iPhone Model, AirPods Model, …). Centralizing it here guarantees both
 * paths behave identically and stay correct as the rules evolve.
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
  orderStyles,
  normalizeImageStyleTags,
} from "@/lib/pricing";
import {
  compatibilityAxisFor,
  priceAxisFor,
} from "@/lib/catalog/product-types";
import {
  normalizeOfferedCompatibility,
  normalizeOfferedPriceValues,
} from "@/lib/catalog/offered-options";
import {
  applyCustomImageTags,
  mergeOfferedStyleValues,
  minOfferedPrice,
  recoverCustomImageLinks,
  validateCustomStylesDraft,
  type CustomStyle,
  type CustomStyleInput,
} from "@/lib/catalog/custom-styles";

export type SaveVariationsInput = {
  productId: number;
  /** Image ids in their new display order (top → bottom). */
  imageOrder: number[];
  /** 0-based slot the video occupies among the images. Null = no video slot. */
  videoSlot: number | null;
  /**
   * imageId → the style the photo depicts. `[]` means universal. Normalized to
   * at most one entry on write, so a caller sending several can't create a
   * photo that represents more than one variation.
   */
  styleTags: Record<number, string[]>;
  /** Canonical styles this product offers (grip/charm bundles). */
  availableStyles: string[];
  /**
   * The devices this product is sold for (the type's compatibility axis).
   * Omit to leave that axis untouched.
   */
  availableModels?: string[];
  /**
   * Operator flag: photos depict more than one physical product. Omit to
   * leave the stored flag untouched (e.g. a styles-only bulk apply).
   */
  containsMultipleProducts?: boolean;
  /**
   * Operator-defined Style values. Omit to leave stored custom rows
   * untouched; send `[]` to clear them.
   */
  customStyles?: CustomStyleInput[];
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

async function deleteNamedOption(productId: number, name: string) {
  await db
    .delete(productOptions)
    .where(
      and(
        eq(productOptions.productId, productId),
        eq(productOptions.name, name),
      ),
    );
}

function canonicalStylesFor(
  productType: string,
  availableStyles: string[],
  hasCustom: boolean,
): string[] {
  const priceAxis = priceAxisFor(productType);
  if (!priceAxis) return [];
  let styles = normalizeOfferedPriceValues(productType, availableStyles);
  if (styles.length === 0 && !hasCustom) {
    styles =
      productType === "iphone_case" ? ["Case Only"] : [...priceAxis.values];
  }
  if (productType === "iphone_case") {
    styles = orderStyles(styles);
  }
  return styles;
}

/**
 * Persist media order, per-image style tags, the video slot, the offered Style
 * set (+ base price), optional custom variations, and optionally the offered
 * compatibility set for a single product. Returns a per-product result so bulk
 * callers can report partial failures without aborting the whole batch.
 */
export async function saveProductVariations(
  input: SaveVariationsInput,
): Promise<SaveVariationsResult> {
  const { productId } = input;

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: {
      id: true,
      currency: true,
      videoUrl: true,
      productType: true,
      price: true,
      containsMultipleProducts: true,
      customStyles: true,
    },
    with: { images: { columns: { id: true } } },
  });
  if (!product) return { ok: false, message: `#${productId}: not found.` };

  const priceAxis = priceAxisFor(product.productType);

  // ── Validate the image set matches what's on the product ──────────────────
  const ownedIds = new Set(product.images.map((i) => i.id));
  const orderIds = input.imageOrder.filter((id) => ownedIds.has(id));
  if (orderIds.length !== ownedIds.size) {
    return {
      ok: false,
      message: `#${productId}: image list out of sync — reload and retry.`,
    };
  }

  // ── Custom variations ─────────────────────────────────────────────────────
  // Omit = leave stored rows alone (a styles-only write cannot wipe them).
  // An explicit array is validated, then recovered against image tags so a
  // photo tagged "Hello Kitty + Charm" still links if the picker id was lost.
  let custom: CustomStyle[];
  let flagged = product.containsMultipleProducts;
  const writingCustom = input.customStyles !== undefined;
  const writingFlag = input.containsMultipleProducts !== undefined;

  if (writingCustom) {
    const wantsFlag = writingFlag
      ? Boolean(input.containsMultipleProducts)
      : true;
    if (!wantsFlag) {
      custom = [];
      flagged = false;
    } else {
      const validated = validateCustomStylesDraft(input.customStyles, {
        ownedImageIds: ownedIds,
        productType: product.productType,
      });
      if (!validated.ok) {
        return { ok: false, message: `#${productId}: ${validated.message}` };
      }
      custom = recoverCustomImageLinks(validated.styles, input.styleTags);
      flagged = writingFlag
        ? Boolean(input.containsMultipleProducts) || custom.length > 0
        : custom.length > 0 || product.containsMultipleProducts;
    }
  } else {
    const kept = validateCustomStylesDraft(product.customStyles ?? [], {
      ownedImageIds: ownedIds,
      productType: product.productType,
    });
    custom = kept.ok ? kept.styles : [];
    if (writingFlag) {
      flagged = Boolean(input.containsMultipleProducts) || custom.length > 0;
      if (!input.containsMultipleProducts && custom.length > 0) {
        custom = [];
        flagged = false;
      }
    }
  }

  const canonical = canonicalStylesFor(
    product.productType,
    input.availableStyles,
    custom.length > 0,
  );
  if (canonical.length === 0 && custom.length === 0 && priceAxis) {
    return {
      ok: false,
      message: `#${productId}: keep at least one style, or add a custom variation first.`,
    };
  }

  const offered = mergeOfferedStyleValues(canonical, custom);
  const tags = applyCustomImageTags(
    input.styleTags,
    custom,
    offered,
    orderIds,
  );

  // ── 1. Image positions + style tags ───────────────────────────────────────
  await Promise.all(
    orderIds.map((id, index) =>
      db
        .update(productImages)
        .set({
          position: index,
          styleTags: normalizeImageStyleTags(tags[id], offered),
        })
        .where(eq(productImages.id, id)),
    ),
  );

  // ── 2. Video slot + listing "from" price + multi-product fields ───────────
  const videoSlot = product.videoUrl
    ? clamp(input.videoSlot ?? 1, 0, orderIds.length)
    : null;
  const productUpdate: {
    videoPosition: number | null;
    price?: string;
    containsMultipleProducts?: boolean;
    customStyles?: CustomStyle[];
    updatedAt: Date;
  } = { videoPosition: videoSlot, updatedAt: new Date() };

  if (offered.length > 0) {
    productUpdate.price = String(
      minOfferedPrice({
        productType: product.productType,
        currency: product.currency,
        canonicalStyles: canonical,
        customStyles: custom,
        basePrice: product.price,
      }),
    );
  }

  if (writingCustom || writingFlag) {
    productUpdate.containsMultipleProducts = flagged;
    productUpdate.customStyles = custom;
  }

  await db.update(products).set(productUpdate).where(eq(products.id, productId));

  // ── 3. Variation axes ─────────────────────────────────────────────────────
  const styleAxisName = priceAxis?.name ?? STYLE_OPTION_NAME;
  if (offered.length > 0) {
    await upsertOption(productId, styleAxisName, offered);
  } else if (!priceAxis) {
    // A flat type that no longer has custom values should not keep an empty
    // Style picker on the PDP.
    await deleteNamedOption(productId, STYLE_OPTION_NAME);
  }

  if (input.availableModels) {
    const axis = compatibilityAxisFor(product.productType);
    if (axis) {
      const models = normalizeOfferedCompatibility(
        product.productType,
        input.availableModels,
      );
      // A product must always offer at least one fit; ignore empty sets so a
      // caller cannot wipe the buyer's picker by accident.
      if (models.length > 0) {
        await upsertOption(productId, axis.name, models);
      }
    }
  }

  return { ok: true, message: "Saved." };
}

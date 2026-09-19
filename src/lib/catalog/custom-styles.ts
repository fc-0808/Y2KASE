/**
 * Operator-defined custom variations for listings that photograph more than
 * one physical product.
 *
 * Canonical Style values ("Case Only", "Case + Charm", …) describe *how* a
 * single product is configured. A folder that actually contains two cases — or
 * a case and a separately sold charm — needs extra priced-axis values the
 * operator names themselves ("Hello Kitty + Charm", "Kuromi Case Only") and
 * links to the photo that depicts that product. Those values live alongside
 * the canonical bundles in the same Style dropdown, matching the Etsy bulk
 * listing editor.
 *
 * This module is the single source of truth for the stored shape, the
 * sanitiser, pricing overlay, and the image-link invariants. Pure — safe in
 * the client and the server.
 */
import {
  STYLE_OPTION_NAME,
  STYLES,
  getProductEntryPrice,
  getStylePrice,
  normalizeImageStyleTags,
} from "@/lib/pricing";
import { getProductType, priceAxisFor } from "./product-types";

/** Etsy property-value length cap; we keep the same so copy stays portable. */
export const CUSTOM_STYLE_MAX_LABEL = 45;
/** Keep models × styles well under typical marketplace inventory limits. */
export const CUSTOM_STYLE_MAX_COUNT = 24;

/**
 * One operator-defined priced-axis value.
 *
 * `id` is stable across renames so a drag-reorder cannot recreate the row.
 * `imageId` is the `product_images.id` buyers see when they pick this value;
 * null means "no photo linked yet".
 */
export type CustomStyle = {
  id: string;
  label: string;
  price: number;
  imageId: number | null;
};

/** Wire-format: anything a form, JSON column or Server Action might send. */
export type CustomStyleInput = {
  id?: unknown;
  label?: unknown;
  price?: unknown;
  imageId?: unknown;
};

export type CustomStyleSaveError = {
  ok: false;
  message: string;
};

export type CustomStyleSaveOk = {
  ok: true;
  styles: CustomStyle[];
};

function asTrimmedLabel(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, CUSTOM_STYLE_MAX_LABEL);
}

function asPositivePrice(raw: unknown): number | null {
  if (raw === "" || raw == null) return null;
  const price = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(price) || price <= 0) return null;
  return Math.round(price * 100) / 100;
}

function asImageId(raw: unknown): number | null {
  const id = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export function newCustomStyleId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `cs_${rand}`;
}

/** Canonical priced-axis values this product type already knows. */
export function canonicalPriceValues(productTypeId: string): readonly string[] {
  const axis = priceAxisFor(productTypeId);
  return axis?.values ?? [];
}

export function isCanonicalPriceValue(
  productTypeId: string,
  style: string,
): boolean {
  const axis = priceAxisFor(productTypeId);
  if (axis) return axis.values.includes(style);
  return (STYLES as readonly string[]).includes(style);
}

/**
 * Sanitise an operator-defined list of custom Style values.
 *
 * Rules: label required (trimmed, ≤45 chars) and unique (case-insensitive);
 * labels that collide with a canonical bundle are dropped (a listing cannot
 * have two "Case + Charm" values); price must be a positive number; imageId
 * is a known gallery id or null. Invalid/duplicate rows are dropped. Order
 * is preserved. Caps at {@link CUSTOM_STYLE_MAX_COUNT}.
 */
export function normalizeCustomStyles(
  input: readonly CustomStyleInput[] | null | undefined,
  opts?: {
    ownedImageIds?: ReadonlySet<number>;
    productType?: string;
  },
): CustomStyle[] {
  if (!Array.isArray(input)) return [];
  const owned = opts?.ownedImageIds;
  const reserved = new Set(
    (opts?.productType
      ? canonicalPriceValues(opts.productType)
      : STYLES
    ).map((value) => value.toLowerCase()),
  );
  const out: CustomStyle[] = [];
  const seen = new Set<string>();

  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const label = asTrimmedLabel(raw.label);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key) || reserved.has(key)) continue;
    const price = asPositivePrice(raw.price);
    if (price == null) continue;
    let imageId = asImageId(raw.imageId);
    if (imageId != null && owned && !owned.has(imageId)) imageId = null;
    seen.add(key);
    const id =
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim().slice(0, 64)
        : newCustomStyleId();
    out.push({ id, label, price, imageId });
    if (out.length >= CUSTOM_STYLE_MAX_COUNT) break;
  }
  return out;
}

/**
 * Validate a draft before write. Empty rows (no label, no price) are ignored.
 * A row with a name but no price — or a price but no name — is an operator
 * error, not silent data loss.
 */
export function validateCustomStylesDraft(
  input: readonly CustomStyleInput[] | null | undefined,
  opts?: {
    ownedImageIds?: ReadonlySet<number>;
    productType?: string;
  },
): CustomStyleSaveError | CustomStyleSaveOk {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: true, styles: [] };
  }

  const reserved = new Set(
    (opts?.productType
      ? canonicalPriceValues(opts.productType)
      : STYLES
    ).map((value) => value.toLowerCase()),
  );
  const seen = new Set<string>();
  let meaningful = 0;

  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const label = asTrimmedLabel(raw.label);
    const price = asPositivePrice(raw.price);
    const hasPriceInput =
      raw.price !== "" && raw.price != null && String(raw.price).trim() !== "";
    if (!label && !hasPriceInput) continue;
    meaningful += 1;
    if (!label) {
      return {
        ok: false,
        message: "Every custom variation needs a name.",
      };
    }
    if (price == null) {
      return {
        ok: false,
        message: `"${label}" needs a price greater than zero.`,
      };
    }
    const key = label.toLowerCase();
    if (reserved.has(key)) {
      return {
        ok: false,
        message: `"${label}" is already a standard style — pick a product-specific name (e.g. “Hello Kitty + Charm”).`,
      };
    }
    if (seen.has(key)) {
      return {
        ok: false,
        message: `Two custom variations are both named "${label}".`,
      };
    }
    seen.add(key);
    if (meaningful > CUSTOM_STYLE_MAX_COUNT) {
      return {
        ok: false,
        message: `A listing can have at most ${CUSTOM_STYLE_MAX_COUNT} custom variations.`,
      };
    }
  }

  return { ok: true, styles: normalizeCustomStyles(input, opts) };
}

export function customStyleLabels(
  styles: readonly CustomStyle[],
): string[] {
  return styles.map((style) => style.label);
}

/**
 * Canonical offered values first (price order), then custom labels in the
 * operator's order. This is the buyer-facing Style dropdown.
 */
export function mergeOfferedStyleValues(
  canonical: readonly string[],
  customStyles: readonly CustomStyle[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of canonical) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  for (const style of customStyles) {
    if (!style.label || seen.has(style.label)) continue;
    seen.add(style.label);
    out.push(style.label);
  }
  return out;
}

/**
 * The offered set image tagging and coverage hints should use: canonical
 * bundles plus every custom label.
 */
export function taggingStylesFor(
  canonical: readonly string[],
  customStyles: readonly CustomStyle[],
): string[] {
  return mergeOfferedStyleValues(canonical, customStyles);
}

/** Look up a custom row by its buyer-facing label. */
export function customStyleByLabel(
  styles: readonly CustomStyle[],
  label: string | null | undefined,
): CustomStyle | undefined {
  if (!label) return undefined;
  return styles.find((style) => style.label === label);
}

/**
 * Authoritative unit price for one selection.
 *
 * Custom labels always win over the type's price table — otherwise a name
 * like "Kitty + Charm" would silently ring up as Case Only. Canonical labels
 * still read the shared table. Types without a price axis fall back to the
 * stored listing price unless a custom row matched.
 */
export function listingUnitPrice(args: {
  productType: string;
  currency: string;
  selected: Record<string, string>;
  customStyles?: readonly CustomStyleInput[] | null;
  basePrice: string | number;
}): number {
  const custom = normalizeCustomStyles(args.customStyles, {
    productType: args.productType,
  });
  const axis = priceAxisFor(args.productType);
  const axisName = axis?.name ?? STYLE_OPTION_NAME;
  const selectedStyle = args.selected[axisName];
  const matched = customStyleByLabel(custom, selectedStyle);
  if (matched) return matched.price;
  if (axis) {
    return getProductType(args.productType).getPriceFromOptions(
      args.selected,
      args.currency,
    );
  }
  const parsed = Number(args.basePrice);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * The "from" price advertised on cards, JSON-LD and Open Graph.
 *
 * Once a listing has custom variations, `products.price` is the snapshot of
 * the cheapest offered value written on save — trust it so a custom-only
 * listing cannot advertise Case Only. Listings without custom styles keep
 * the live Style table so cards stay in lock-step with the PDP.
 */
export function listingEntryPrice(args: {
  productType: string;
  storedPrice: string | number;
  currency: string;
  customStyles?: readonly CustomStyleInput[] | null;
}): number {
  const custom = normalizeCustomStyles(args.customStyles, {
    productType: args.productType,
  });
  if (custom.length > 0) {
    const parsed = Number(args.storedPrice);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return Math.min(...custom.map((style) => style.price));
  }
  return getProductEntryPrice(
    args.productType,
    args.storedPrice,
    args.currency,
  );
}

/** Cheapest price across canonical offerings + custom rows, for a save. */
export function minOfferedPrice(args: {
  productType: string;
  currency: string;
  canonicalStyles: readonly string[];
  customStyles: readonly CustomStyle[];
  basePrice: string | number;
}): number {
  const prices: number[] = [];
  const axis = priceAxisFor(args.productType);
  if (axis) {
    const offered =
      args.canonicalStyles.length > 0
        ? args.canonicalStyles
        : args.customStyles.length > 0
          ? []
          : [axis.values[0]].filter(Boolean);
    for (const style of offered) {
      prices.push(
        getProductType(args.productType).getPriceFromOptions(
          { [axis.name]: style },
          args.currency,
        ),
      );
    }
  }
  for (const style of args.customStyles) prices.push(style.price);
  if (prices.length > 0) return Math.min(...prices);
  const parsed = Number(args.basePrice);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Starting price for a newly added custom row. Guesses a canonical bundle
 * from the label ("charm", "grip") so the operator is one edit away from
 * the right number instead of staring at 0.00.
 */
export function suggestedCustomStylePrice(
  productType: string,
  currency: string,
  label = "",
): number {
  const lower = label.toLowerCase();
  const charmOnly = /charm\s*only/.test(lower);
  const gripOnly = /grip\s*only/.test(lower);
  const hasCharm = /charm/.test(lower);
  const hasGrip = /grip/.test(lower);
  let style = "Case Only";
  if (charmOnly) style = "Charm Only";
  else if (gripOnly) style = "Grip Only";
  else if (hasGrip && hasCharm) style = "Case + Grip + Charm";
  else if (hasGrip) style = "Case + Grip";
  else if (hasCharm) style = "Case + Charm";
  const axis = priceAxisFor(productType);
  if (axis) {
    return getProductType(productType).getPriceFromOptions(
      { [axis.name]: style },
      currency,
    );
  }
  return getStylePrice(style, currency);
}

const PRICE_TIER_EPS = 0.005;

export function pricesMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < PRICE_TIER_EPS;
}

/**
 * Selectable price tiers for a custom variation, taken from this device
 * type's live price table (the same numbers the Style picker charges).
 *
 * Unique by amount — Case + Charm and Case + Grip both ring up $34.99, so
 * they share one chip. Axis order is preserved (most complete first).
 */
export type CustomStylePricePreset = {
  /** Canonical style (or type label, on a flat-priced line) this amount is. */
  label: string;
  price: number;
  /** Other canonical styles that share this amount. */
  also: string[];
};

export function customStylePricePresets(
  productType: string,
  currency: string,
): CustomStylePricePreset[] {
  const type = getProductType(productType);
  const axis = priceAxisFor(productType);
  const byPrice = new Map<number, CustomStylePricePreset>();
  const order: number[] = [];

  const add = (label: string, raw: number) => {
    const price = Math.round(raw * 100) / 100;
    if (!Number.isFinite(price) || price <= 0) return;
    const existing = byPrice.get(price);
    if (existing) {
      if (existing.label !== label && !existing.also.includes(label)) {
        existing.also.push(label);
      }
      return;
    }
    byPrice.set(price, { label, price, also: [] });
    order.push(price);
  };

  if (axis) {
    for (const style of axis.values) {
      add(style, type.getPriceFromOptions({ [axis.name]: style }, currency));
    }
  } else {
    add(type.label, type.getBasePrice(currency));
  }

  return order.map((price) => byPrice.get(price)!);
}

export function isDevicePricePreset(
  productType: string,
  currency: string,
  price: number,
): boolean {
  if (!Number.isFinite(price) || price <= 0) return false;
  return customStylePricePresets(productType, currency).some((preset) =>
    pricesMatch(preset.price, price),
  );
}

export function emptyCustomStyleDraft(
  productType: string,
  currency: string,
): CustomStyle {
  return {
    id: newCustomStyleId(),
    label: "",
    price: suggestedCustomStylePrice(productType, currency),
    imageId: null,
  };
}

/**
 * Photo that belongs to a Style selection — linked custom row first, then a
 * photo tagged with that label. No hero fallback: a PDP gallery jump must
 * not yank the shopper to image 1 when the variation has no dedicated shot.
 */
export function imageForStyleSelection<
  T extends { id: number; styleTags: string[] },
>(
  images: readonly T[],
  selectedStyle: string | null | undefined,
  customStyles: readonly CustomStyle[] = [],
): T | undefined {
  if (!images.length || !selectedStyle) return undefined;
  const linkedId = customStyleByLabel(customStyles, selectedStyle)?.imageId;
  if (linkedId != null) {
    const linked = images.find((image) => image.id === linkedId);
    if (linked) return linked;
  }
  return images.find((image) => image.styleTags.includes(selectedStyle));
}

/**
 * Gallery photo buyers (and the cart thumbnail) should see for a Style.
 * Prefers the custom row's linked image, then a photo tagged with that
 * style, then the first gallery image.
 */
export function variationImage<T extends { id: number; styleTags: string[] }>(
  images: readonly T[],
  selectedStyle: string | null | undefined,
  customStyles: readonly CustomStyle[] = [],
): T | undefined {
  return (
    imageForStyleSelection(images, selectedStyle, customStyles) ?? images[0]
  );
}

/**
 * Load-time hydrate: sanitise stored rows, then fill a missing `imageId`
 * from a photo that already carries the label. Admin editors treat
 * `imageId` as the write source of truth; without this, a row ingested
 * from tags-only data would look unlinked.
 */
export function hydrateCustomStyles(
  input: readonly CustomStyleInput[] | null | undefined,
  images: readonly { id: number; styleTags?: string[] | null }[],
  productType?: string,
): CustomStyle[] {
  const ownedImageIds = new Set(images.map((image) => image.id));
  return recoverCustomImageLinks(
    normalizeCustomStyles(input, { ownedImageIds, productType }),
    Object.fromEntries(
      images.map((image) => [image.id, image.styleTags ?? []]),
    ),
  );
}

export function recoverCustomImageLinks(
  styles: readonly CustomStyle[],
  tagsByImageId: Readonly<Record<number, readonly string[]>>,
): CustomStyle[] {
  return styles.map((style) => {
    if (style.imageId != null) return style;
    const match = Object.entries(tagsByImageId).find(([, tags]) =>
      tags.includes(style.label),
    );
    if (!match) return style;
    const imageId = Number(match[0]);
    return Number.isInteger(imageId) ? { ...style, imageId } : style;
  });
}

/**
 * Assign a photo to one Style value (canonical or custom). One photo, one
 * variation: linking a custom row to an image both tags that image and
 * clears any other custom row that pointed at it.
 */
export function setImageVariationTag(input: {
  imageId: number;
  /** null = universal (not tied to a variation). */
  style: string | null;
  customStyles: readonly CustomStyle[];
  imageIds: readonly number[];
  tagsByImageId: Readonly<Record<number, readonly string[]>>;
  offered: readonly string[];
}): {
  customStyles: CustomStyle[];
  tagsByImageId: Record<number, string[]>;
} {
  const tags: Record<number, string[]> = {};
  for (const id of input.imageIds) {
    tags[id] = normalizeImageStyleTags(
      input.tagsByImageId[id],
      input.offered,
    );
  }
  tags[input.imageId] = input.style
    ? normalizeImageStyleTags([input.style], input.offered)
    : [];

  if (input.style) {
    for (const id of input.imageIds) {
      if (id === input.imageId) continue;
      if (tags[id][0] === input.style) tags[id] = [];
    }
  }

  const customStyles = input.customStyles.map((style) => {
    if (input.style && style.label === input.style) {
      return { ...style, imageId: input.imageId };
    }
    if (style.imageId === input.imageId) {
      return { ...style, imageId: null };
    }
    return style;
  });

  return { customStyles, tagsByImageId: tags };
}

/** Keep image tags pointing at a custom row when the operator renames it. */
export function renameCustomStyleLabel(
  styles: readonly CustomStyle[],
  customId: string,
  nextLabel: string,
  tagsByImageId: Readonly<Record<number, readonly string[]>>,
  offeredAfter: readonly string[],
): {
  customStyles: CustomStyle[];
  tagsByImageId: Record<number, string[]>;
} {
  const current = styles.find((style) => style.id === customId);
  const label = asTrimmedLabel(nextLabel);
  const customStyles = styles.map((style) =>
    style.id === customId ? { ...style, label } : style,
  );
  const tags: Record<number, string[]> = {};
  for (const [id, prev] of Object.entries(tagsByImageId)) {
    const imageId = Number(id);
    let next = [...prev];
    if (current?.label && current.label !== label) {
      next = next.map((tag) => (tag === current.label ? label : tag));
    }
    tags[imageId] = normalizeImageStyleTags(next, offeredAfter);
  }
  return { customStyles, tagsByImageId: tags };
}

/** Drop a custom row and clear its tag from any photo that carried it. */
export function removeCustomStyle(
  styles: readonly CustomStyle[],
  customId: string,
  tagsByImageId: Readonly<Record<number, readonly string[]>>,
  offeredAfter: readonly string[],
): {
  customStyles: CustomStyle[];
  tagsByImageId: Record<number, string[]>;
} {
  const removed = styles.find((style) => style.id === customId);
  const customStyles = styles.filter((style) => style.id !== customId);
  const tags: Record<number, string[]> = {};
  for (const [id, prev] of Object.entries(tagsByImageId)) {
    const imageId = Number(id);
    const stripped = removed
      ? prev.filter((tag) => tag !== removed.label)
      : prev;
    tags[imageId] = normalizeImageStyleTags(stripped, offeredAfter);
  }
  return { customStyles, tagsByImageId: tags };
}

/**
 * Overlay custom imageId links onto a tag map so a photo picker is the
 * source of truth. A custom label only stays on the photo that row links
 * to; unlinking (or pointing the row at another photo) clears the old tag.
 */
export function applyCustomImageTags(
  tagsByImageId: Readonly<Record<number, readonly string[]>>,
  customStyles: readonly CustomStyle[],
  offered: readonly string[],
  imageIds: readonly number[],
): Record<number, string[]> {
  const labels = new Map(customStyles.map((style) => [style.label, style]));
  const tags: Record<number, string[]> = {};
  for (const id of imageIds) {
    const current = normalizeImageStyleTags(tagsByImageId[id], offered);
    const tag = current[0];
    const owner = tag ? labels.get(tag) : undefined;
    if (owner && owner.imageId !== id) {
      tags[id] = [];
      continue;
    }
    tags[id] = current;
  }
  for (const style of customStyles) {
    if (style.imageId == null || !imageIds.includes(style.imageId)) continue;
    tags[style.imageId] = normalizeImageStyleTags([style.label], offered);
  }
  return tags;
}

export function customStylesNeedPhoto(
  styles: readonly CustomStyle[],
): string[] {
  return styles.filter((style) => style.imageId == null).map((style) => style.label);
}

/**
 * Rewrite tags after the operator renames or deletes a custom row, before
 * {@link applyCustomImageTags} overlays `imageId`. A rename that only
 * patched the label would otherwise leave the old string on the photo,
 * which is no longer in the offered set and would be stripped.
 */
export function rewriteTagsAfterCustomEdit(
  tagsByImageId: Readonly<Record<number, readonly string[]>>,
  previous: readonly CustomStyle[],
  next: readonly CustomStyle[],
): Record<number, string[]> {
  const nextIds = new Set(next.map((style) => style.id));
  const removed = new Set(
    previous
      .filter((style) => !nextIds.has(style.id) && style.label)
      .map((style) => style.label),
  );
  const renamed = new Map<string, string>();
  const previousLabel = new Map(
    previous.map((style) => [style.id, style.label]),
  );
  for (const style of next) {
    const old = previousLabel.get(style.id);
    if (old && style.label && old !== style.label) renamed.set(old, style.label);
  }
  const out: Record<number, string[]> = {};
  for (const [id, tags] of Object.entries(tagsByImageId)) {
    out[Number(id)] = (tags ?? [])
      .map((tag) => renamed.get(tag) ?? tag)
      .filter((tag) => !removed.has(tag));
  }
  return out;
}

/** Client-draft counterpart of the save overlay: rename, then pin by imageId. */
export function syncCustomDraftMedia(args: {
  imageIds: readonly number[];
  tagsByImageId: Readonly<Record<number, readonly string[]>>;
  previous: readonly CustomStyle[];
  next: readonly CustomStyle[];
  canonical: readonly string[];
}): Record<number, string[]> {
  return applyCustomImageTags(
    rewriteTagsAfterCustomEdit(
      args.tagsByImageId,
      args.previous,
      args.next,
    ),
    args.next,
    taggingStylesFor(args.canonical, args.next),
    args.imageIds,
  );
}

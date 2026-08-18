/**
 * Y2KASE pricing master — single source of truth.
 *
 * Mirrors Y2KASE_Pricing_Master_4_Currencies.xlsx ("True Customer Price" column).
 * Price depends ONLY on the selected Style. The iPhone model is a free choice
 * and does not change the price.
 *
 * If you update the spreadsheet, update PRICE_TABLE here too (or regenerate it).
 */

/** Option axis names — these are the `product_options.name` values in the DB. */
export const MODEL_OPTION_NAME = "iPhone Model";
export const STYLE_OPTION_NAME = "Style";

/** Selectable iPhone models (buyer's free choice — does not affect price). */
export const IPHONE_MODELS = [
  "iPhone 14 / 13",
  "iPhone 14 Pro",
  "iPhone 14 Pro Max",
  "iPhone 15",
  "iPhone 15 Pro",
  "iPhone 15 Pro Max",
  "iPhone 16",
  "iPhone 16 Pro",
  "iPhone 16 Pro Max",
  "iPhone 17",
  "iPhone 17 Pro",
  "iPhone 17 Pro Max",
] as const;

/** Selectable styles — drives the price. Ordered most → least complete. */
export const STYLES = [
  "Case + Grip + Charm",
  "Case + Grip",
  "Case + Charm",
  "Case Only",
  "Grip Only",
  "Charm Only",
] as const;

export type Style = (typeof STYLES)[number];

/**
 * The default style a product page opens on. "Case Only" is the entry price
 * and what the listing card's "from" price reflects.
 */
export const DEFAULT_STYLE: Style = "Case Only";

/**
 * True Customer Price by currency → style.
 * Source: Y2KASE_Pricing_Master_4_Currencies.xlsx.
 */
export const PRICE_TABLE: Record<string, Record<Style, number>> = {
  USD: {
    "Case + Grip + Charm": 39.99,
    "Case + Grip": 34.99,
    "Case + Charm": 34.99,
    "Case Only": 24.99,
    "Grip Only": 24.99,
    "Charm Only": 12.99,
  },
  CAD: {
    "Case + Grip + Charm": 53.99,
    "Case + Grip": 47.49,
    "Case + Charm": 47.49,
    "Case Only": 33.99,
    "Grip Only": 33.99,
    "Charm Only": 17.99,
  },
  HKD: {
    "Case + Grip + Charm": 313.99,
    "Case + Grip": 274.49,
    "Case + Charm": 274.49,
    "Case Only": 195.99,
    "Grip Only": 195.99,
    "Charm Only": 101.99,
  },
  CNY: {
    "Case + Grip + Charm": 285.99,
    "Case + Grip": 249.99,
    "Case + Charm": 249.99,
    "Case Only": 178.49,
    "Grip Only": 178.49,
    "Charm Only": 92.99,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Shipping — single source of truth shared by the client cart and the server
// checkout, so the total the buyer sees pre-checkout matches Stripe exactly.
// ─────────────────────────────────────────────────────────────────────────────

/** Free-shipping threshold + flat rate per currency, in minor units (cents). */
export const SHIPPING: Record<
  string,
  { freeOverCents: number; flatCents: number }
> = {
  USD: { freeOverCents: 3500, flatCents: 499 },
  CAD: { freeOverCents: 4900, flatCents: 699 },
  HKD: { freeOverCents: 27000, flatCents: 3900 },
  CNY: { freeOverCents: 25000, flatCents: 3500 },
};

/** Validated storefront currency used by public promotional copy. */
export const STORE_CURRENCY = (() => {
  const configured = (
    process.env.NEXT_PUBLIC_STORE_CURRENCY ?? "USD"
  ).toUpperCase();
  return configured in SHIPPING ? configured : "USD";
})();

/** Human-readable threshold derived from the checkout shipping table. */
export function formatShippingThreshold(
  currency = STORE_CURRENCY,
): string {
  const normalized = currency.toUpperCase();
  const selected = normalized in SHIPPING ? normalized : "USD";
  const amount = SHIPPING[selected].freeOverCents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: selected,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

export const FREE_SHIPPING_OFFER =
  `Free standard shipping for orders over ${formatShippingThreshold()}`;

export type ShippingQuote = {
  shippingCents: number;
  freeOverCents: number;
  flatCents: number;
  /** Cents still needed to unlock free shipping (0 if already qualified). */
  remainingCents: number;
  qualifiesFree: boolean;
};

/** Compute the shipping quote for a subtotal (in cents) and currency. */
export function shippingQuote(
  currency: string,
  subtotalCents: number,
): ShippingQuote {
  const cfg = SHIPPING[currency?.toUpperCase()] ?? SHIPPING.USD;
  const qualifiesFree = subtotalCents >= cfg.freeOverCents;
  return {
    shippingCents: qualifiesFree ? 0 : cfg.flatCents,
    freeOverCents: cfg.freeOverCents,
    flatCents: cfg.flatCents,
    remainingCents: Math.max(0, cfg.freeOverCents - subtotalCents),
    qualifiesFree,
  };
}

/** Currency used when an unknown currency is requested. */
const FALLBACK_CURRENCY = "USD";

function tableFor(currency: string): Record<Style, number> {
  return PRICE_TABLE[currency?.toUpperCase()] ?? PRICE_TABLE[FALLBACK_CURRENCY];
}

/** Price for a given style + currency. Falls back to the default style. */
export function getStylePrice(style: string | undefined, currency: string): number {
  const table = tableFor(currency);
  if (style && style in table) return table[style as Style];
  return table[DEFAULT_STYLE];
}

/** Entry ("from") price for a product — the default style's price. */
export function getBasePrice(currency: string): number {
  return tableFor(currency)[DEFAULT_STYLE];
}

/**
 * Canonical price first shown for a product.
 *
 * iPhone cases are priced from the live Style table, while every other product
 * type uses its stored catalog price. Cards, PDP metadata, JSON-LD and merchant
 * feeds all call this boundary so a crawler can never see a different price
 * from the shopper.
 */
export function getProductEntryPrice(
  productType: string,
  storedPrice: string | number,
  currency: string,
): number {
  if (productType === "iphone_case") return getBasePrice(currency);

  const parsed = Number(storedPrice);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/** The two option axes every phone-case product carries, in display order. */
export function defaultPhoneCaseOptions(): { name: string; values: string[] }[] {
  return [
    { name: MODEL_OPTION_NAME, values: [...IPHONE_MODELS] },
    { name: STYLE_OPTION_NAME, values: [...STYLES] },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-product style availability
//
// Not every product physically ships with a grip and/or a charm. A product's
// offered styles are derived from what add-ons exist for it:
//   • grip + charm → all 6 styles
//   • grip only    → Case + Grip, Case Only, Grip Only
//   • charm only   → Case + Charm, Case Only, Charm Only
//   • neither      → Case Only
// The "Case Only" style is always available (every product has a case).
// ─────────────────────────────────────────────────────────────────────────────

/** Which add-ons a product offers. `Case Only` always exists implicitly. */
export type StyleAddons = { hasGrip: boolean; hasCharm: boolean };

/**
 * Canonical, price-ordered list of styles a product should offer given the
 * add-ons it ships with. Always ordered most → least complete and always
 * includes "Case Only".
 */
export function stylesForAddons({ hasGrip, hasCharm }: StyleAddons): Style[] {
  const out: Style[] = [];
  if (hasGrip && hasCharm) out.push("Case + Grip + Charm");
  if (hasGrip) out.push("Case + Grip");
  if (hasCharm) out.push("Case + Charm");
  out.push("Case Only");
  if (hasGrip) out.push("Grip Only");
  if (hasCharm) out.push("Charm Only");
  return out;
}

/**
 * Infer add-ons from an arbitrary set of style values (e.g. what's currently
 * stored on a product's "Style" option). A product "has grip" if any offered
 * style mentions grip, and likewise for charm.
 */
export function addonsFromStyles(styles: readonly string[]): StyleAddons {
  return {
    hasGrip: styles.some((s) => /grip/i.test(s)),
    hasCharm: styles.some((s) => /charm/i.test(s)),
  };
}

/** Sort an arbitrary list of style strings into the canonical price order. */
export function orderStyles(styles: readonly string[]): Style[] {
  const seen = new Set<string>();
  return STYLES.filter((s) => styles.includes(s) && !seen.has(s) && seen.add(s));
}

/** The default style to preselect, given a product's available styles. */
export function defaultStyleFor(styles: readonly string[]): string {
  if (styles.includes(DEFAULT_STYLE)) return DEFAULT_STYLE;
  return orderStyles(styles)[0] ?? styles[0] ?? DEFAULT_STYLE;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-image style tagging
//
// A photograph shows exactly one physical configuration of the product, so an
// image carries AT MOST ONE style tag. `product_images.style_tags` stays an
// array because the empty case is meaningful — "universal": a lifestyle, detail
// or packaging shot that doesn't represent any single variation.
//
// The storefront resolves a style to its photo with `find(img =>
// img.styleTags.includes(style))`, so a photo tagged with several styles
// quietly becomes the representative shot for all of them. The vision
// classifier used to be prompted to tag inclusively, which is how multi-tagged
// rows got into the catalogue in the first place. Every reader and writer now
// funnels through `normalizeImageStyleTags`, so legacy rows and new writes both
// collapse to the one configuration the photo actually depicts.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collapse arbitrary tag input to the canonical at-most-one-tag form.
 *
 * Unrecognized values are dropped, and when `offered` is supplied so are styles
 * the product no longer sells. If more than one valid tag survives, the most
 * complete wins — {@link STYLES} is ordered most → least complete, so for a
 * photo tagged `["Case + Grip + Charm", "Case + Grip"]` that picks the bundle
 * genuinely on camera rather than the subset it also happens to illustrate.
 *
 * @returns `[]` (universal) or a single-element array. Never longer.
 */
export function normalizeImageStyleTags(
  tags: readonly string[] | null | undefined,
  offered?: readonly string[],
): Style[] {
  if (!tags || tags.length === 0) return [];
  const allowed = offered ? new Set<string>(offered) : null;
  const ranked = orderStyles(tags).filter((s) => !allowed || allowed.has(s));
  return ranked.length > 0 ? [ranked[0]] : [];
}

/** The single style a photo represents, or `null` when it's universal. */
export function imageStyleTag(
  tags: readonly string[] | null | undefined,
  offered?: readonly string[],
): Style | null {
  return normalizeImageStyleTags(tags, offered)[0] ?? null;
}

/** The canonical stored form for a single-select choice (`null` = universal). */
export function styleTagsFor(style: string | null | undefined): Style[] {
  return style ? normalizeImageStyleTags([style]) : [];
}

/**
 * Whether `tags` is already canonical, so callers can skip a no-op write.
 * Compares element-wise: normalization is both a cardinality cap and a filter,
 * so a same-length list can still differ (an unoffered tag became universal).
 */
export function imageStyleTagsAreCanonical(
  tags: readonly string[] | null | undefined,
  offered?: readonly string[],
): boolean {
  const next = normalizeImageStyleTags(tags, offered);
  return next.length === (tags?.length ?? 0) && next[0] === tags?.[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-product iPhone model availability
//
// Every phone-case product is sold for a *subset* of the master model list —
// e.g. a mold that only fits iPhone 15→17. Which models a product offers is
// stored as the `values` array of its "iPhone Model" product_option row, so
// narrowing the set here automatically narrows the buyer's choices on the PDP.
//
// Models are grouped into generations so the admin can pick a contiguous range
// (e.g. "13/14 → 17") in one gesture, then fine-tune individual variants.
// ─────────────────────────────────────────────────────────────────────────────

export type IphoneGeneration = {
  /** Stable id used for range math (also the headline number shown in the UI). */
  id: string;
  /** Human label for the generation group. */
  label: string;
  /** The models that belong to this generation, in master order. */
  models: string[];
};

/**
 * Generations in release order (oldest → newest). The union of every group's
 * `models` must equal {@link IPHONE_MODELS} exactly — this is asserted below.
 */
export const IPHONE_GENERATIONS: IphoneGeneration[] = [
  {
    id: "14",
    label: "iPhone 13 / 14",
    models: ["iPhone 14 / 13", "iPhone 14 Pro", "iPhone 14 Pro Max"],
  },
  {
    id: "15",
    label: "iPhone 15",
    models: ["iPhone 15", "iPhone 15 Pro", "iPhone 15 Pro Max"],
  },
  {
    id: "16",
    label: "iPhone 16",
    models: ["iPhone 16", "iPhone 16 Pro", "iPhone 16 Pro Max"],
  },
  {
    id: "17",
    label: "iPhone 17",
    models: ["iPhone 17", "iPhone 17 Pro", "iPhone 17 Pro Max"],
  },
];

/** Sort an arbitrary list of model strings into canonical master order. */
export function orderModels(models: readonly string[]): string[] {
  const seen = new Set<string>();
  return IPHONE_MODELS.filter(
    (m) => models.includes(m) && !seen.has(m) && seen.add(m),
  );
}

/** The generation id a given model belongs to (or null if unrecognized). */
export function generationOf(model: string): string | null {
  return IPHONE_GENERATIONS.find((g) => g.models.includes(model))?.id ?? null;
}

/**
 * Where a model sits within its generation. Shoppers think in tiers before they
 * think in years ("I have the Pro Max"), so the PDP keeps the tier fixed when
 * they move between generations instead of dumping them back on the base model.
 */
export type ModelTier = "base" | "pro" | "pro-max";

export function modelTier(model: string): ModelTier {
  if (/pro\s*max$/i.test(model)) return "pro-max";
  if (/pro$/i.test(model)) return "pro";
  return "base";
}

/**
 * Split an offered model set into generation groups, oldest → newest, dropping
 * generations the product doesn't sell.
 *
 * Models outside the master map (a hand-edited row, a phone released after this
 * table was last touched) are collected into a trailing group rather than
 * discarded — a model a product genuinely sells must never become unpickable.
 */
export function groupModelsByGeneration(
  models: readonly string[],
): IphoneGeneration[] {
  const offered = new Set(models);
  const groups = IPHONE_GENERATIONS.map((g) => ({
    ...g,
    models: g.models.filter((m) => offered.has(m)),
  })).filter((g) => g.models.length > 0);

  const ungrouped = models.filter((m) => generationOf(m) === null);
  if (ungrouped.length > 0) {
    groups.push({ id: "other", label: "Other models", models: [...ungrouped] });
  }
  return groups;
}

/**
 * Every model within an inclusive generation range, in master order.
 * Accepts the two endpoints in any order (auto-normalized low → high).
 */
export function modelsForGenerationRange(
  fromGenId: string,
  toGenId: string,
): string[] {
  const ids = IPHONE_GENERATIONS.map((g) => g.id);
  let a = ids.indexOf(fromGenId);
  let b = ids.indexOf(toGenId);
  if (a === -1 || b === -1) return [];
  if (a > b) [a, b] = [b, a];
  return IPHONE_GENERATIONS.slice(a, b + 1).flatMap((g) => g.models);
}

/** A product must always be available for at least one model. */
export function defaultModels(): string[] {
  return [...IPHONE_MODELS];
}

/**
 * Compact, human-readable summary of an offered model set for table/badge
 * display — e.g. "iPhone 15–17", "iPhone 16", "All models", "8 of 12 models".
 */
export function summarizeModels(models: readonly string[]): string {
  const ordered = orderModels(models);
  if (ordered.length === 0) return "No models";
  if (ordered.length === IPHONE_MODELS.length) return "All models";

  const set = new Set(ordered);
  const fullGens = IPHONE_GENERATIONS.filter((g) =>
    g.models.every((m) => set.has(m)),
  );
  const coveredByFull = fullGens.reduce((n, g) => n + g.models.length, 0);

  // The selection is exactly some whole generations → show a clean range.
  if (fullGens.length > 0 && coveredByFull === ordered.length) {
    const nums = fullGens.map((g) => g.id);
    return nums.length === 1
      ? `iPhone ${nums[0]}`
      : `iPhone ${nums[0]}–${nums[nums.length - 1]}`;
  }
  return `${ordered.length} of ${IPHONE_MODELS.length} models`;
}

// Fail fast at module load if the generation map drifts from the master list.
if (process.env.NODE_ENV !== "production") {
  const flat = IPHONE_GENERATIONS.flatMap((g) => g.models);
  const missing = IPHONE_MODELS.filter((m) => !flat.includes(m));
  if (missing.length > 0 || flat.length !== IPHONE_MODELS.length) {
    throw new Error(
      `IPHONE_GENERATIONS is out of sync with IPHONE_MODELS (missing: ${missing.join(", ")})`,
    );
  }
}

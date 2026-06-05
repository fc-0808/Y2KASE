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
    "Case + Grip + Charm": 32.49,
    "Case + Grip": 27.49,
    "Case + Charm": 27.49,
    "Case Only": 18.49,
    "Grip Only": 18.49,
    "Charm Only": 9.49,
  },
  CAD: {
    "Case + Grip + Charm": 44.49,
    "Case + Grip": 37.49,
    "Case + Charm": 37.49,
    "Case Only": 24.99,
    "Grip Only": 24.99,
    "Charm Only": 12.99,
  },
  HKD: {
    "Case + Grip + Charm": 254.4,
    "Case + Grip": 215.25,
    "Case + Charm": 215.25,
    "Case Only": 144.78,
    "Grip Only": 144.78,
    "Charm Only": 74.31,
  },
  CNY: {
    "Case + Grip + Charm": 231.65,
    "Case + Grip": 196,
    "Case + Charm": 196,
    "Case Only": 131.83,
    "Grip Only": 131.83,
    "Charm Only": 67.66,
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

/** Master order lookup for stable, human-friendly model sorting. */
const MODEL_ORDER = new Map<string, number>(
  IPHONE_MODELS.map((m, i) => [m, i]),
);

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

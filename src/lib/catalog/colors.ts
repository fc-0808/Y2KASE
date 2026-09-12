/**
 * Color facet — the shopper-facing vocabulary, and the only place allowed to
 * decide what a color *is*.
 *
 * Phone cases are a visually driven catalog. Baymard, Shopify and every large
 * fashion PLP treat color as a first-class facet: a closed family list (so
 * "navy", "sky" and "cobalt" don't fragment into three dead-end checkboxes),
 * OR-within / AND-across boolean logic, live counts, and a *visual* swatch
 * rather than a text label shoppers have to translate. This module is the
 * data half of that contract. The URL, the SQL, the filter menu, the admin
 * picker and the merchant feed all read from here so they cannot drift.
 *
 * ── Why families, not raw names ─────────────────────────────────────────────
 * A listing titled "Mint Green Matte" and a folder named `薄荷绿` are the same
 * shopper intent. Storing the raw strings would split one facet into dozens of
 * one-product values — the classic "navy vs dark blue vs midnight" failure.
 * Families are the unit of filtering; aliases are how we recognise them.
 *
 * ── What this module will not do ────────────────────────────────────────────
 * It never infers color from a character ("Hello Kitty → pink"). That guess
 * is frequently wrong and, unlike a missed classification, it *misleads*.
 * Empty is honest; a blue Kuromi under Pink is a conversion bug.
 *
 * Pure: no I/O, no React, no database. Pixel extraction (Sharp) lives in
 * `./color-extract` so this file stays importable from client components.
 */

/** Canonical family slugs — also the `?color=` query values and DB storage. */
export const COLOR_FAMILY_SLUGS = [
  "pink",
  "purple",
  "blue",
  "red",
  "black",
  "white",
  "clear",
  "yellow",
  "green",
  "orange",
  "brown",
  "beige",
  "grey",
  "gold",
  "silver",
  "multicolor",
] as const;

export type ColorFamilySlug = (typeof COLOR_FAMILY_SLUGS)[number];

const COLOR_SLUG_SET = new Set<string>(COLOR_FAMILY_SLUGS);

export function isColorFamilySlug(value: string): value is ColorFamilySlug {
  return COLOR_SLUG_SET.has(value);
}

/**
 * How the swatch paints. Solids are a hex; the rest are CSS backgrounds the
 * storefront and admin share so a "Clear" chip looks like glass everywhere.
 */
export type ColorSwatchStyle =
  | { kind: "solid"; hex: string }
  | { kind: "clear" }
  | { kind: "gold" }
  | { kind: "silver" }
  | { kind: "multicolor" };

export type ColorFamily = {
  slug: ColorFamilySlug;
  /** Shopper-facing label. Title Case, never the slug. */
  label: string;
  /**
   * Google Merchant `g:color` token. Keep these in Google's recommended
   * English color names so Shopping ads can match query color intent.
   */
  merchant: string;
  swatch: ColorSwatchStyle;
  /**
   * True when the swatch needs a hairline ring to stay visible on a white
   * card (white, beige, yellow, clear, silver).
   */
  light: boolean;
  /**
   * Recognition vocabulary. Latin aliases match on word boundaries; CJK
   * aliases match as substrings (Chinese folder names have no word breaks).
   * Longer phrases must be listed — they are compiled longest-first so
   * "rose gold" wins over "rose" and "mint green" wins over "mint".
   */
  aliases: readonly string[];
};

/**
 * Display order is conversion order for this catalog, not the rainbow:
 * kawaii pinks/purples first, then the neutrals a shopper uses to disqualify,
 * then the rest. The filter menu renders in this order so the layout is
 * stable across pages — sorting by count would reshuffle the swatches every
 * time another facet changed, which is how shoppers lose their place.
 */
export const COLOR_FAMILIES: readonly ColorFamily[] = [
  {
    slug: "pink",
    label: "Pink",
    merchant: "Pink",
    swatch: { kind: "solid", hex: "#ff7eb3" },
    light: false,
    aliases: [
      "hot pink",
      "baby pink",
      "pastel pink",
      "light pink",
      "dusty pink",
      "blush pink",
      "bubblegum",
      "magenta",
      "fuchsia",
      "fuschia",
      "sakura",
      "coral pink",
      "salmon",
      "blush",
      "rose",
      "pink",
      "樱花粉",
      "粉红色",
      "粉色",
      "粉红",
      "桃红",
      "玫红",
      "粉",
    ],
  },
  {
    slug: "purple",
    label: "Purple",
    merchant: "Purple",
    swatch: { kind: "solid", hex: "#8b5cf6" },
    light: false,
    aliases: [
      "lavender",
      "lilac",
      "violet",
      "mauve",
      "plum",
      "amethyst",
      "periwinkle",
      "purple",
      "香芋",
      "薰衣草紫",
      "紫色",
      "紫",
    ],
  },
  {
    slug: "blue",
    label: "Blue",
    merchant: "Blue",
    swatch: { kind: "solid", hex: "#3b82f6" },
    light: false,
    aliases: [
      "navy blue",
      "sky blue",
      "baby blue",
      "light blue",
      "dark blue",
      "pastel blue",
      "cobalt",
      "azure",
      "indigo",
      "navy",
      "teal",
      "turquoise",
      "cyan",
      "aqua",
      "blue",
      "海军蓝",
      "天蓝色",
      "浅蓝色",
      "深蓝色",
      "蓝色",
      "天蓝",
      "蓝",
    ],
  },
  {
    slug: "red",
    label: "Red",
    merchant: "Red",
    swatch: { kind: "solid", hex: "#ef4444" },
    light: false,
    aliases: [
      "burgundy",
      "maroon",
      "scarlet",
      "crimson",
      "wine red",
      "cherry",
      "red",
      "酒红色",
      "大红色",
      "红色",
      "酒红",
      "大红",
      "红",
    ],
  },
  {
    slug: "black",
    label: "Black",
    merchant: "Black",
    swatch: { kind: "solid", hex: "#171717" },
    light: false,
    aliases: ["charcoal black", "jet black", "matte black", "black", "黑色", "黑"],
  },
  {
    slug: "white",
    label: "White",
    merchant: "White",
    swatch: { kind: "solid", hex: "#ffffff" },
    light: true,
    aliases: [
      "off white",
      "off-white",
      "pearl white",
      "snow white",
      "pure white",
      "white",
      "乳白色",
      "白色",
      "奶白",
      "白",
    ],
  },
  {
    slug: "clear",
    label: "Clear",
    merchant: "Clear",
    swatch: { kind: "clear" },
    light: true,
    aliases: [
      "transparent",
      "translucent",
      "see through",
      "see-through",
      "clear case",
      "clear",
      "jelly",
      "果冻",
      "透明",
      "透色",
      "清透",
    ],
  },
  {
    slug: "yellow",
    label: "Yellow",
    merchant: "Yellow",
    swatch: { kind: "solid", hex: "#f5c518" },
    light: true,
    aliases: [
      "lemon yellow",
      "pastel yellow",
      "mustard",
      "lemon",
      "canary",
      "yellow",
      "柠檬黄",
      "黄色",
      "姜黄",
      "黄",
    ],
  },
  {
    slug: "green",
    label: "Green",
    merchant: "Green",
    swatch: { kind: "solid", hex: "#22c55e" },
    light: false,
    aliases: [
      "mint green",
      "sage green",
      "forest green",
      "olive green",
      "lime green",
      "honeydew",
      "matcha",
      "mint",
      "sage",
      "olive",
      "lime",
      "green",
      "薄荷绿",
      "蜜瓜绿",
      "青绿色",
      "墨绿色",
      "绿色",
      "青绿",
      "墨绿",
      "绿",
    ],
  },
  {
    slug: "orange",
    label: "Orange",
    merchant: "Orange",
    swatch: { kind: "solid", hex: "#f97316" },
    light: false,
    aliases: [
      "tangerine",
      "apricot",
      "peach",
      "coral",
      "orange",
      "橘色",
      "橙色",
      "橘",
      "橙",
    ],
  },
  {
    slug: "brown",
    label: "Brown",
    merchant: "Brown",
    swatch: { kind: "solid", hex: "#8b5a2b" },
    light: false,
    aliases: [
      "chocolate",
      "espresso",
      "mocha",
      "cognac",
      "bronze",
      "copper",
      "brown",
      "咖啡色",
      "棕色",
      "咖色",
      "咖啡",
      "棕",
      "咖",
    ],
  },
  {
    slug: "beige",
    label: "Beige",
    merchant: "Beige",
    swatch: { kind: "solid", hex: "#e8d5b7" },
    light: true,
    aliases: [
      "off white",
      "cream",
      "ivory",
      "khaki",
      "camel",
      "taupe",
      "sand",
      "nude",
      "champagne",
      "beige",
      "oatmeal",
      "奶茶色",
      "米白色",
      "卡其色",
      "米色",
      "米白",
      "卡其",
      "杏色",
    ],
  },
  {
    slug: "grey",
    label: "Grey",
    merchant: "Grey",
    swatch: { kind: "solid", hex: "#9ca3af" },
    light: true,
    aliases: [
      "charcoal",
      "graphite",
      "slate",
      "gray",
      "grey",
      "gunmetal",
      "灰色",
      "灰",
    ],
  },
  {
    slug: "gold",
    label: "Gold",
    merchant: "Gold",
    swatch: { kind: "gold" },
    light: true,
    aliases: [
      "rose gold",
      "yellow gold",
      "champagne gold",
      "gold",
      "golden",
      "香槟金",
      "金色",
      "金",
    ],
  },
  {
    slug: "silver",
    label: "Silver",
    merchant: "Silver",
    swatch: { kind: "silver" },
    light: true,
    aliases: ["silver", "chrome", "银色", "银"],
  },
  {
    slug: "multicolor",
    label: "Multicolor",
    merchant: "Multicolor",
    swatch: { kind: "multicolor" },
    light: false,
    aliases: [
      "multi color",
      "multi-color",
      "multicolor",
      "multicolour",
      "rainbow",
      "holographic",
      "iridescent",
      "prism",
      "holo",
      "gradient",
      "tie dye",
      "tie-dye",
      "炫彩",
      "彩虹",
      "渐变",
      "彩色",
    ],
  },
] as const;

const FAMILY_BY_SLUG: Record<ColorFamilySlug, ColorFamily> = Object.fromEntries(
  COLOR_FAMILIES.map((family) => [family.slug, family]),
) as Record<ColorFamilySlug, ColorFamily>;

export function colorFamily(slug: ColorFamilySlug): ColorFamily {
  return FAMILY_BY_SLUG[slug];
}

export function colorFamilyLabel(slug: string): string {
  return isColorFamilySlug(slug) ? FAMILY_BY_SLUG[slug].label : slug;
}

/** CSS `background` for a family swatch — shared by every surface that paints one. */
export function colorSwatchBackground(family: ColorFamily): string {
  switch (family.swatch.kind) {
    case "solid":
      return family.swatch.hex;
    case "clear":
      return "repeating-conic-gradient(#e8e8e8 0% 25%, #ffffff 0% 50%) 50% / 10px 10px";
    case "gold":
      return "linear-gradient(135deg, #f7e7a1 0%, #c9a227 52%, #f3d56b 100%)";
    case "silver":
      return "linear-gradient(135deg, #f4f4f5 0%, #a1a1aa 52%, #e4e4e7 100%)";
    case "multicolor":
      return "conic-gradient(from 180deg, #ff6b9d, #ffd166, #6bcb77, #4d96ff, #c77dff, #ff6b9d)";
  }
}

/**
 * Google Merchant `g:color` value. Multiple families join with `/` per the
 * attribute spec (`Pink/White`). Empty when the product has not been classified
 * — omitting the attribute is safer than inventing a color Google will then
 * show in Shopping.
 */
export function merchantColorValue(slugs: readonly string[]): string | null {
  const labels = slugs
    .filter(isColorFamilySlug)
    .map((slug) => FAMILY_BY_SLUG[slug].merchant);
  return labels.length > 0 ? labels.join("/") : null;
}

// ── Matching ────────────────────────────────────────────────────────────────

const CJK_CHAR = /[\u3400-\u9fff]/;

type LatinRule = { re: RegExp; slug: ColorFamilySlug; length: number };
type CjkRule = { needle: string; slug: ColorFamilySlug; length: number };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileRules(): { latin: LatinRule[]; cjk: CjkRule[] } {
  const latin: LatinRule[] = [];
  const cjk: CjkRule[] = [];
  const seenLatin = new Set<string>();
  const seenCjk = new Set<string>();

  for (const family of COLOR_FAMILIES) {
    for (const raw of family.aliases) {
      const alias = raw.trim();
      if (!alias) continue;
      if (CJK_CHAR.test(alias)) {
        if (seenCjk.has(alias)) continue;
        seenCjk.add(alias);
        cjk.push({ needle: alias, slug: family.slug, length: alias.length });
        continue;
      }
      const key = alias.toLowerCase();
      if (seenLatin.has(key)) continue;
      seenLatin.add(key);
      latin.push({
        re: new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(key)}(?:$|[^a-z0-9])`, "i"),
        slug: family.slug,
        length: key.length,
      });
    }
  }

  latin.sort((a, b) => b.length - a.length);
  cjk.sort((a, b) => b.length - a.length);
  return { latin, cjk };
}

const RULES = compileRules();

/**
 * Resolve one untrusted token (model output, query param, admin input) to a
 * family. Accepts the slug itself or any alias ("Navy" → blue).
 */
export function parseColorFamily(raw: unknown): ColorFamilySlug | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const slug = trimmed.toLowerCase().replace(/[\s_]+/g, "-");
  if (isColorFamilySlug(slug)) return slug;
  const hits = classifyColorsFromText(trimmed);
  return hits[0] ?? null;
}

/** Normalise an untrusted list: coerce, de-duplicate, keep taxonomy order. */
export function parseColorFamilies(
  raw: unknown,
  cap: number = COLOR_FAMILY_SLUGS.length,
): ColorFamilySlug[] {
  const found = new Set<ColorFamilySlug>();
  const push = (value: unknown) => {
    const slug = parseColorFamily(value);
    if (slug) found.add(slug);
  };
  if (Array.isArray(raw)) {
    for (const item of raw) push(item);
  } else if (typeof raw === "string") {
    for (const part of raw.split(/[/,|]+/)) push(part);
  }
  return COLOR_FAMILY_SLUGS.filter((slug) => found.has(slug)).slice(0, cap);
}

function normalizeHaystack(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[_/\\|+,.:;()[\]{}-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

/**
 * Walk a blob of listing text and return every family it names, in taxonomy
 * order. The padded-haystack trick lets the latin regex use `(^|[^a-z0-9])`
 * even at the start of the string, so "red" never matches "hundred" or
 * "featured" and "tan" never matches "stand".
 */
export function classifyColorsFromText(
  ...values: (string | null | undefined)[]
): ColorFamilySlug[] {
  const latinHaystack = normalizeHaystack(values.filter(Boolean).join(" "));
  const cjkHaystack = values.filter(Boolean).join(" ");
  if (!latinHaystack.trim() && !cjkHaystack) return [];

  const found = new Set<ColorFamilySlug>();
  let latinHay = latinHaystack;
  for (const rule of RULES.latin) {
    if (found.has(rule.slug)) continue;
    if (!rule.re.test(latinHay)) continue;
    found.add(rule.slug);
    // Consume the match so a shorter alias that is a prefix of a longer one
    // ("rose" inside "rose gold") cannot fire as a second family.
    latinHay = latinHay.replace(rule.re, " ");
  }
  if (CJK_CHAR.test(cjkHaystack)) {
    let cjkHay = cjkHaystack;
    for (const rule of RULES.cjk) {
      if (found.has(rule.slug)) continue;
      if (!cjkHay.includes(rule.needle)) continue;
      found.add(rule.slug);
      cjkHay = cjkHay.split(rule.needle).join("");
    }
  }
  return COLOR_FAMILY_SLUGS.filter((slug) => found.has(slug));
}

export type ColorSignals = {
  title?: string | null;
  description?: string | null;
  tags?: readonly string[] | null;
  sourceFolder?: string | null;
  materials?: string | null;
};

/** Text-side classification from every signal the catalog already stores. */
export function classifyProductColors(signals: ColorSignals): ColorFamilySlug[] {
  return classifyColorsFromText(
    signals.title,
    signals.description,
    signals.materials,
    signals.sourceFolder,
    ...(signals.tags ?? []),
  );
}

/**
 * A single RGB pixel's family, or null when it is canvas/background noise.
 *
 * Used by Sharp extraction (and its unit tests) so the hue buckets live next
 * to the aliases they have to agree with: "mint" in a title and a mint pixel
 * in a thumbnail must land in the same family.
 */
export function colorFamilyFromRgb(
  r: number,
  g: number,
  b: number,
): ColorFamilySlug | null {
  // Near-white canvas of the normalized thumbnail — never a product color.
  if (r >= 248 && g >= 248 && b >= 248) return null;

  const { h, s, l } = rgbToHsl(r, g, b);

  if (l < 16) return "black";
  if (s < 10) {
    if (l < 22) return "black";
    if (l > 88) return "white";
    if (l > 72) return "white";
    return "grey";
  }

  // Metallics before the hue buckets they would otherwise fall into.
  if (h >= 36 && h <= 56 && s >= 32 && s <= 90 && l >= 40 && l <= 72) {
    return s >= 45 ? "gold" : "beige";
  }
  if (s < 16 && l >= 48 && l <= 82) return "silver";

  if ((h >= 320 || h < 12) && l >= 58 && s >= 18) return "pink";
  if (h < 12 || h >= 348) return "red";
  if (h < 38) {
    if (l < 42 && s < 58) return "brown";
    return "orange";
  }
  if (h < 46 && l < 44 && s < 55) return "brown";
  if (h < 52 && l >= 68 && s <= 45) return "beige";
  if (h < 70) return "yellow";
  if (h < 170) return "green";
  if (h < 258) return "blue";
  return "purple";
}

export type PixelColorVote = {
  slug: ColorFamilySlug;
  /** Share of *product* pixels (background already discarded), 0–1. */
  share: number;
};

/**
 * Histogram a bag of RGB triples into family votes.
 *
 * `minShare` drops trace colors (a 3% pink bow on an otherwise black case
 * should not file the listing under Pink — that's how filters lose trust).
 * A product with three or more chromatic families above the bar also earns
 * Multicolor, *in addition to* its dominant hues, so a shopper filtering
 * Pink still finds a pink-heavy print.
 */
export function classifyColorsFromPixels(
  pixels: readonly { r: number; g: number; b: number }[],
  opts: { minShare?: number; maxFamilies?: number } = {},
): ColorFamilySlug[] {
  const minShare = opts.minShare ?? 0.12;
  const maxFamilies = opts.maxFamilies ?? 3;
  if (pixels.length === 0) return [];

  const counts = new Map<ColorFamilySlug, number>();
  let productPixels = 0;
  for (const pixel of pixels) {
    const family = colorFamilyFromRgb(pixel.r, pixel.g, pixel.b);
    if (!family) continue;
    productPixels += 1;
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  // A thumbnail that is almost entirely the white canvas has no usable signal
  // — typical of a white or clear case on a white ground. Guessing here is
  // how those listings get stamped Grey.
  if (productPixels < 24) return [];

  const votes: PixelColorVote[] = [...counts.entries()]
    .map(([slug, count]) => ({ slug, share: count / productPixels }))
    .filter((vote) => vote.share >= minShare)
    .sort((a, b) => b.share - a.share);

  const slugs = votes.slice(0, maxFamilies).map((vote) => vote.slug);
  const chromatic = slugs.filter(
    (slug) =>
      slug !== "black" &&
      slug !== "white" &&
      slug !== "grey" &&
      slug !== "clear" &&
      slug !== "multicolor",
  );
  if (chromatic.length >= 3 && !slugs.includes("multicolor")) {
    slugs.push("multicolor");
  }
  return COLOR_FAMILY_SLUGS.filter((slug) => slugs.includes(slug));
}

/** Cap on families stored per product — enough for a print, not a dump. */
export const MAX_PRODUCT_COLORS = 4;

/**
 * Union several classifiers, keeping taxonomy order and the per-product cap.
 * AI + text + pixels all get a vote; none of them is allowed to flood the
 * facet with every hue it half-saw.
 */
export function mergeColorClassifications(
  ...groups: readonly (readonly ColorFamilySlug[])[]
): ColorFamilySlug[] {
  const found = new Set<ColorFamilySlug>();
  for (const group of groups) {
    for (const slug of group) found.add(slug);
  }
  return COLOR_FAMILY_SLUGS.filter((slug) => found.has(slug)).slice(
    0,
    MAX_PRODUCT_COLORS,
  );
}

function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6;
  else if (max === G) h = ((B - R) / d + 2) / 6;
  else h = ((R - G) / d + 4) / 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

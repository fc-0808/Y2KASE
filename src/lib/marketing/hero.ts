import type { CampaignType } from "./types";
import { isBuyTwoGetTwoOfferText } from "./offer";

export const MARKETING_HERO_REFERENCE_LIMIT = 4;
export const MARKETING_HERO_OUTPUT = {
  width: 1200,
  height: 720,
  maxBytes: 250 * 1024,
} as const;

export const MARKETING_HERO_STYLES = [
  {
    id: "pastel-flatlay",
    label: "Pearlescent studio",
    description:
      "Airy aqua, lavender, peach, and pearl light with editorial curves.",
  },
  {
    id: "clean-studio",
    label: "Clean editorial",
    description:
      "Ivory, ice blue, and soft lilac with a restrained gallery finish.",
  },
  {
    id: "holographic-editorial",
    label: "Holographic aurora",
    description:
      "Prismatic aqua, violet, blush, and chrome-inspired light ribbons.",
  },
] as const;

export type MarketingHeroStyle =
  (typeof MARKETING_HERO_STYLES)[number]["id"];

export type MarketingHeroReference = {
  title: string;
  imageUrl: string;
};

export function isMarketingHeroStyle(
  value: unknown,
): value is MarketingHeroStyle {
  return MARKETING_HERO_STYLES.some((style) => style.id === value);
}

/** Block assets produced by the retired model-repaint path. */
export function isLegacyGenerativeMarketingHeroUrl(value: string): boolean {
  try {
    return /\/marketing\/campaigns\/[^/]+\/hero-\d+-[a-f0-9-]+\.jpg$/i.test(
      new URL(value).pathname,
    );
  } catch {
    return false;
  }
}

/**
 * Infer how many products best communicate the campaign. Bundle mechanics are
 * detected from persisted draft copy as well as the transient operator offer,
 * so reopening a saved "Buy 2, Get 2 Free" draft still recommends four.
 */
export function recommendedMarketingHeroReferenceCount(input: {
  campaignType: CampaignType;
  campaignText: string;
}): number {
  const text = input.campaignText.replace(/\s+/g, " ");
  if (isBuyTwoGetTwoOfferText(text)) return 4;
  if (
    input.campaignType === "product-launch" ||
    input.campaignType === "restock"
  ) {
    return 1;
  }
  return input.campaignType === "promotion" ? 3 : 2;
}

function stableSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Deterministically choose visual references, keeping the featured product
 * first and rotating the rest by campaign id. The same draft therefore does
 * not reshuffle on every render, while separate campaigns avoid always showing
 * the first four catalogue rows.
 */
export function selectMarketingHeroReferenceIds(input: {
  campaignId: string;
  products: readonly { id: number; imageUrl: string | null }[];
  targetCount: number;
  featuredProductId?: number | null;
}): number[] {
  const requested = Number.isFinite(input.targetCount)
    ? Math.floor(input.targetCount)
    : 1;
  const target = Math.max(
    1,
    Math.min(MARKETING_HERO_REFERENCE_LIMIT, requested),
  );
  const eligible = [...input.products]
    .filter(
      (product) =>
        Number.isInteger(product.id) &&
        product.id > 0 &&
        Boolean(product.imageUrl?.trim()),
    )
    .sort((a, b) => a.id - b.id);
  if (eligible.length === 0) return [];

  const selected: number[] = [];
  const featured = eligible.find(
    (product) => product.id === input.featuredProductId,
  );
  if (featured) selected.push(featured.id);

  const pool = eligible.filter((product) => product.id !== featured?.id);
  const offset = pool.length
    ? stableSeed(input.campaignId) % pool.length
    : 0;
  for (let index = 0; index < pool.length && selected.length < target; index += 1) {
    selected.push(pool[(offset + index) % pool.length]!.id);
  }
  return selected;
}

function truncateAtWord(value: string, max: number): string {
  if (value.length <= max) return value;
  const clipped = value.slice(0, max - 1);
  const boundary = clipped.lastIndexOf(" ");
  const end = boundary > max * 0.65 ? boundary : clipped.length;
  return `${clipped.slice(0, end)}…`;
}

/** Deterministic, editable alt text—never delegated to the image model. */
export function buildMarketingHeroAlt(
  references: readonly MarketingHeroReference[],
): string {
  if (references.length === 0) {
    return "Y2KASE products styled in a pastel editorial scene.";
  }
  const cleanTitle = (title: string) =>
    title.replace(/\s+/g, " ").trim().slice(0, 120);
  if (references.length === 1) {
    return truncateAtWord(
      `${cleanTitle(references[0]!.title)} styled in a pastel Y2KASE product scene.`,
      160,
    );
  }
  const titles = references.map((reference) => cleanTitle(reference.title));
  const readable =
    titles.length === 2
      ? titles.join(" and ")
      : `${titles.slice(0, -1).join(", ")}, and ${titles.at(-1)}`;
  return truncateAtWord(
    `A styled Y2KASE arrangement featuring ${readable}.`,
    160,
  );
}

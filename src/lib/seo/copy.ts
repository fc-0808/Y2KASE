/**
 * On-page search copy — the keyword map titles, H1s and meta descriptions
 * are generated from.
 *
 * Google has ignored the HTML meta keywords tag since 2009. Ranking is won by
 * assigning **one primary query per URL** (so pages do not cannibalize each
 * other), then putting that query in the title, the H1 and the first visible
 * paragraph. This module is the source of truth for that assignment.
 *
 * Volume numbers are deliberately not stored here. They go stale, they tempt
 * stuffing, and they belong in Search Console / a research tool — not in the
 * render path. See the cannibalization table on {@link PAGE_COPY}.
 */

import { FREE_SHIPPING_OFFER } from "@/lib/pricing";
import { truncateDescription } from "@/lib/seo";

/** Matches the root layout `title.template`. Keep these in lockstep. */
export const BRAND_TITLE_SUFFIX = " · Y2KASE";
export const BRAND_TITLE_TEMPLATE = `%s${BRAND_TITLE_SUFFIX}`;

/**
 * Typical Google desktop title display. The layout template appends
 * {@link BRAND_TITLE_SUFFIX}, so leaf titles must fit the remainder.
 */
export const SERP_TITLE_MAX = 60;
export const SERP_TITLE_LEAF_MAX =
  SERP_TITLE_MAX - BRAND_TITLE_SUFFIX.length;

export type StaticPageCopy = {
  /** `metadata.title` leaf. The root template appends the brand — except home. */
  title: string;
  heading: string;
  description: string;
  /** The query this URL is allowed to compete for. */
  primary: string;
};

export type CollectionSeoInput = {
  name: string;
  slug: string;
  kind?: string | null;
  description?: string | null;
};

export type CollectionSeoCopy = {
  title: string;
  heading: string;
  description: string;
  tagline: string;
  primary: string;
};

/**
 * Head-term map for the indexable templates.
 *
 * | URL                         | Owns                                      | Does not own                          |
 * |-----------------------------|-------------------------------------------|---------------------------------------|
 * | `/`                         | Brand query "Y2KASE"                      | Generic "kawaii phone cases"          |
 * | `/products`                 | "cute phone cases" (catalog umbrella)     | Exact "kawaii" / "y2k" / "iphone"     |
 * | `/collections`              | Navigational "shop by character"          | "character phone cases" (child page)  |
 * | `/collections/kawaii`       | "kawaii phone cases"                      | Brand or device queries               |
 * | `/collections/y2k`          | "y2k phone cases"                         |                                       |
 * | `/collections/{character}`  | "{character} phone cases"                 | Device-only queries                   |
 * | `/collections/magsafe`      | "magsafe phone cases"                     |                                       |
 * | `/devices/iphone`           | "iphone cases"                            | Character queries                     |
 * | `/blog`                     | Informational guides                      | Commercial category queries           |
 */
export const PAGE_COPY = {
  home: {
    title: "Y2KASE — Kawaii & Y2K Phone Cases ✨",
    heading: "Y2KASE — Kawaii & Y2K Phone Cases",
    description: `Kawaii, Y2K & holographic phone cases, charms and accessories from Y2KASE. ${FREE_SHIPPING_OFFER}. Shop your vibe.`,
    socialDescription:
      "Kawaii, Y2K & holographic phone cases, charms and accessories. Express your vibe. ✨",
    primary: "y2kase",
  },
  catalog: {
    title: "Cute Phone Cases & Accessories",
    heading: "Cute Phone Cases & Accessories",
    description: `Shop cute phone cases, charms and accessories — kawaii, Y2K and holographic designs. ${FREE_SHIPPING_OFFER}.`,
    primary: "cute phone cases",
  },
  collections: {
    title: "Shop by Character & Brand",
    heading: "Shop by Character & Brand",
    description:
      "Browse Y2KASE phone cases by MagSafe, character and brand — Sanrio, Hello Kitty, Kuromi, Miffy, Tamagotchi and more.",
    primary: "shop phone cases by character",
  },
  about: {
    title: "About Us",
    heading: "About Y2KASE ✨",
    description:
      "Y2KASE is a kawaii and Y2K phone case brand — character cases, grips and charms designed to express your vibe.",
    primary: "y2kase brand",
  },
  faq: {
    title: "Shipping, MagSafe & Returns FAQ",
    heading: "Frequently Asked Questions",
    description:
      "Answers about Y2KASE shipping, iPhone compatibility, MagSafe cases, charms and 30-day returns.",
    primary: "y2kase shipping faq",
  },
  contact: {
    title: "Contact Us",
    heading: "Contact",
    description:
      "Email the Y2KASE team about orders, iPhone case fit, MagSafe and returns — we reply within 24 hours.",
    primary: "y2kase contact",
  },
  blog: {
    title: "The Edit",
    heading: "Style guides, trends & how-tos",
    description:
      "Style guides, trend reports and how-tos for kawaii and Y2K phone cases, charms and accessories — from the Y2KASE team.",
    primary: "kawaii phone case guides",
  },
} as const satisfies Record<string, StaticPageCopy & { socialDescription?: string }>;

/**
 * Collections whose natural query is not `{name} phone cases`.
 * Irregular plurals and feature/genre labels live here so the default
 * composer cannot emit "Characters Phone Cases" or double the noun.
 */
const COLLECTION_HEADING_OVERRIDES: Record<string, string> = {
  characters: "Character Phone Cases",
  magsafe: "MagSafe Phone Cases",
  kawaii: "Kawaii Phone Cases",
  y2k: "Y2K Phone Cases",
  anime: "Anime Phone Cases",
  cartoon: "Cartoon Phone Cases",
};

const PRODUCT_NOUN_RE = /\b(phone cases?|iphone cases?|cases)\b/i;

/** Visible H1 / title leaf for a collection landing page. */
export function collectionHeading(name: string, slug: string): string {
  const override = COLLECTION_HEADING_OVERRIDES[slug];
  if (override) return override;
  if (PRODUCT_NOUN_RE.test(name)) return name;
  return `${name} Phone Cases`;
}

function joinSentences(...parts: string[]): string {
  return parts
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((part) => (/[.!?…]$/u.test(part) ? part : `${part}.`))
    .join(" ");
}

function collectionTagline(input: CollectionSeoInput, heading: string): string {
  const curated = input.description?.trim();
  if (curated) return curated;

  const kind = input.kind ?? "";
  if (kind === "character" || kind === "brand") {
    return `Kawaii, Y2K and holographic designs featuring ${input.name} — MagSafe-ready and drop-protective.`;
  }
  if (kind === "feature") {
    return `Shop ${heading} — kawaii, Y2K and holographic designs, MagSafe-ready.`;
  }
  return `Shop ${heading} — holographic, glittery and character-themed designs.`;
}

function collectionDescription(
  input: CollectionSeoInput,
  heading: string,
): string {
  const curated = input.description?.trim();
  if (curated) {
    return truncateDescription(
      joinSentences(curated, `Shop ${heading}`, FREE_SHIPPING_OFFER),
    );
  }
  return truncateDescription(
    joinSentences(
      `Shop ${heading} at Y2KASE — kawaii, Y2K and holographic designs with MagSafe options`,
      FREE_SHIPPING_OFFER,
    ),
  );
}

/** Title, H1, tagline and meta description for a collection landing page. */
export function collectionSeo(input: CollectionSeoInput): CollectionSeoCopy {
  const heading = collectionHeading(input.name, input.slug);
  return {
    title: heading,
    heading,
    description: collectionDescription(input, heading),
    tagline: collectionTagline(input, heading),
    primary: heading.toLowerCase(),
  };
}

/**
 * Product `<title>` leaf, budgeted for the brand suffix the layout appends.
 * Open Graph keeps the full listing title — social cards are not truncated
 * to Google's display width.
 *
 * {@link truncateDescription} may append an ellipsis, so the clip budget is
 * one character inside the leaf max when the title actually overflows.
 */
export function productSerpTitle(productTitle: string): string {
  const clean = productTitle.replace(/\s+/g, " ").trim();
  if (Array.from(clean).length <= SERP_TITLE_LEAF_MAX) return clean;
  return truncateDescription(clean, SERP_TITLE_LEAF_MAX - 1);
}

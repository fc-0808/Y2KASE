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
import { deviceLabel } from "@/lib/catalog/devices";
import { MAGSAFE_TITLE_SUFFIX } from "@/lib/catalog/magsafe";
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
  /**
   * Device ids this collection currently stocks, in menu order.
   * Drives the product noun: phones stay "Phone Cases", an AirPods-only
   * page says "AirPods Cases", and a mix (iPhone plus AirPods, and so on)
   * says "Cases" so the H1 does not claim the grid is phones only.
   */
  stockedDeviceIds?: string[];
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
 * | `/collections/{character}`  | "{character} phone cases", or "{character} cases" when the grid mixes devices | iPhone 18 model queries               |
 * | `/collections/{character}/iphone-18-pro` | "{character} iPhone 18 Pro and Pro Max cases" — Hello Kitty, Sanrio, Kuromi only | The unscoped character query |
 * | `/collections/magsafe`      | "magsafe phone cases"                     |                                       |
 * | `/collections/originals`    | "original cute phone cases"               | Licensed character queries            |
 * | `/devices/iphone`           | "iphone cases"                            | Character queries; iPhone 18 is owned by the fit pages |
 * | `/devices/airpods`          | "airpods cases" (when the line is live)   | Character queries                     |
 * | `/blog`                     | Informational guides                      | Commercial category queries           |
 * | `/insights`                 | First-party catalog snapshot              | Commercial category queries           |
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
      "Browse Y2KASE phone cases by MagSafe, character, original design and brand — Sanrio, Hello Kitty, Kuromi, Miffy, Tamagotchi and more.",
    primary: "shop phone cases by character",
  },
  about: {
    title: "About Us",
    heading: "About Y2KASE ✨",
    description:
      "Y2KASE is a Hong Kong kawaii and Y2K phone-accessories merchant — character cases, grips and charms, with MagSafe labelled after review.",
    primary: "y2kase brand",
  },
  faq: {
    title: "Shipping, MagSafe & Returns FAQ",
    heading: "Frequently Asked Questions",
    description:
      "Answers about Y2KASE shipping, iPhone and AirPods fit, MagSafe cases, charms and 30-day returns.",
    primary: "y2kase shipping faq",
  },
  contact: {
    title: "Contact Us",
    heading: "Contact Us",
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
  insights: {
    title: "What's in the Catalog",
    heading: "What's in the Y2KASE catalog",
    description:
      "A live count of active Y2KASE phone cases by MagSafe, product type and character — first-party catalog data, not a survey.",
    primary: "y2kase catalog snapshot",
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
  originals: "Original Phone Cases",
};

const PRODUCT_NOUN_RE = /\b(phone cases?|iphone cases?|airpods cases?|cases)\b/i;

const PHONE_CASES_NOUN = "Phone Cases";
const AIRPODS_CASES_NOUN = "AirPods Cases";
const CASES_NOUN = "Cases";

/** Device ids whose products are phone cases. Anything else widens the noun. */
const PHONE_DEVICE_IDS = new Set(["iphone", "galaxy", "pixel"]);

/**
 * Product noun for a collection landing.
 *
 * A phones-only grid owns "phone cases". `/devices/airpods` owns "airpods
 * cases", so an AirPods-only collection may say "AirPods Cases" — that H1
 * cannot cannibalize a phone-cases URL this page does not sell.
 *
 * A mix (iPhone and AirPods, or any non-phone line) says "Cases". Calling
 * that grid "Phone Cases" hides the other devices on the same URL.
 *
 * MagSafe is a phone-case feature collection and never flips noun.
 * Unknown stock keeps "Phone Cases" so callers without a device rollup
 * do not silently widen every character link.
 */
export function collectionProductNoun(
  stockedDeviceIds?: string[],
  slug?: string,
): typeof PHONE_CASES_NOUN | typeof AIRPODS_CASES_NOUN | typeof CASES_NOUN {
  if (slug === "magsafe") return PHONE_CASES_NOUN;
  const ids = [...new Set(stockedDeviceIds ?? [])];
  if (ids.length === 1 && ids[0] === "airpods") return AIRPODS_CASES_NOUN;
  if (ids.length > 0 && ids.every((id) => PHONE_DEVICE_IDS.has(id))) {
    return PHONE_CASES_NOUN;
  }
  if (ids.some((id) => !PHONE_DEVICE_IDS.has(id))) return CASES_NOUN;
  return PHONE_CASES_NOUN;
}

function applyCollectionNoun(heading: string, noun: string): string {
  return heading.replace(/\bPhone Cases\b/g, noun);
}

function collectionIsAirPodsOnly(input: CollectionSeoInput): boolean {
  return (
    collectionProductNoun(input.stockedDeviceIds, input.slug) ===
    AIRPODS_CASES_NOUN
  );
}

/** Visible H1 / title leaf for a collection landing page. */
export function collectionHeading(
  name: string,
  slug: string,
  stockedDeviceIds?: string[],
): string {
  const noun = collectionProductNoun(stockedDeviceIds, slug);
  const override = COLLECTION_HEADING_OVERRIDES[slug];
  if (override) return applyCollectionNoun(override, noun);
  if (PRODUCT_NOUN_RE.test(name)) return name;
  return `${name} ${noun}`;
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
  const airpodsOnly = collectionIsAirPodsOnly(input);
  if (kind === "character" || kind === "brand") {
    return airpodsOnly
      ? `Kawaii, Y2K and holographic designs featuring ${input.name} — AirPods cases.`
      : `Kawaii, Y2K and holographic designs featuring ${input.name} — MagSafe-ready and drop-protective.`;
  }
  if (kind === "feature") {
    return airpodsOnly
      ? `Shop ${heading} — kawaii, Y2K and holographic designs.`
      : `Shop ${heading} — kawaii, Y2K and holographic designs, MagSafe-ready.`;
  }
  return `Shop ${heading} — holographic, glittery and character-themed designs.`;
}

/**
 * First sentence of the meta description for collections Search Console is
 * already showing. The H1 stays the head term (`Hello Kitty Phone Cases`);
 * the snippet leads with the model query that is earning the impressions.
 * Skipped for an AirPods-only grid — that page must not claim an iPhone fit.
 */
const COLLECTION_SNIPPET_LEADS: Record<string, string> = {
  "hello-kitty":
    "Hello Kitty iPhone 18 Pro and iPhone 18 Pro Max cases",
  sanrio:
    "Sanrio iPhone 18 Pro Max and iPhone 18 Pro cases, including Hello Kitty and Kuromi",
  kuromi: "Kuromi iPhone 18 Pro Max and iPhone 18 Pro cases",
  chiikawa: "Chiikawa phone cases",
};

function collectionDescription(
  input: CollectionSeoInput,
  heading: string,
): string {
  const curated = input.description?.trim();
  const lead = collectionIsAirPodsOnly(input)
    ? undefined
    : COLLECTION_SNIPPET_LEADS[input.slug];
  if (curated) {
    return truncateDescription(
      joinSentences(lead ?? "", curated, `Shop ${heading}`, FREE_SHIPPING_OFFER),
    );
  }
  const magSafeClause = collectionIsAirPodsOnly(input)
    ? ""
    : " with MagSafe options";
  return truncateDescription(
    joinSentences(
      lead ?? "",
      `Shop ${heading} at Y2KASE — kawaii, Y2K and holographic designs${magSafeClause}`,
      FREE_SHIPPING_OFFER,
    ),
  );
}

/** Title, H1, tagline and meta description for a collection landing page. */
export function collectionSeo(input: CollectionSeoInput): CollectionSeoCopy {
  const heading = collectionHeading(
    input.name,
    input.slug,
    input.stockedDeviceIds,
  );
  return {
    title: heading,
    heading,
    description: collectionDescription(input, heading),
    tagline: collectionTagline(input, heading),
    primary: heading.toLowerCase(),
  };
}

/**
 * Browser-tab title for a device-narrowed collection view.
 *
 * These URLs are `noindex` (they are facets, not landings), so the title is
 * allowed to name the device without competing with `/devices/{id}`. The
 * visible H1 stays the collection identity.
 */
export function collectionFilteredTitle(
  input: CollectionSeoInput,
  deviceId: string | undefined,
): string {
  const heading = collectionHeading(
    input.name,
    input.slug,
    input.stockedDeviceIds,
  );
  if (!deviceId) return heading;
  const device = deviceLabel(deviceId);
  if (deviceId === "apple-accessories") return `${input.name} ${device}`;
  if (deviceId === "airpods" && heading.endsWith("AirPods Cases")) {
    return heading;
  }
  return `${input.name} ${device} Cases`;
}

function joinEnglish(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

/**
 * On-page tagline that names every stocked product line.
 *
 * Phones-only titles stay "{name} Phone Cases". A grid that also stocks
 * AirPods or another line uses "{name} Cases", so the H1 matches the
 * products. An AirPods-only collection names that line. The subtitle still
 * lists every stocked device when the merchant has not written one.
 * Curated descriptions always win.
 */
export function collectionBrowseTagline(
  input: CollectionSeoInput,
  stockedDeviceIds: string[],
): string {
  const copy = collectionSeo({ ...input, stockedDeviceIds });
  if (input.description?.trim()) return copy.tagline;

  const kind = input.kind ?? "";
  if (kind !== "character" && kind !== "brand") return copy.tagline;

  const labels = stockedDeviceIds
    .map((id) => deviceLabel(id))
    .filter((label, index, all) => label.length > 0 && all.indexOf(label) === index);
  if (labels.length < 2) return copy.tagline;

  return `Kawaii, Y2K and holographic designs featuring ${input.name} — ${joinEnglish(labels)} cases.`;
}

/**
 * Product `<title>` leaf, budgeted for the brand suffix the layout appends.
 * Open Graph keeps the full listing title — social cards are not truncated
 * to Google's display width.
 *
 * Listing titles put the device last (`…Phone Case for iPhone 18 17 16 15 Pro Max`).
 * A front clip deletes that clause, so a result for "hello kitty iphone 18 pro
 * case" shows a title with no model in it. When the leaf overflows, keep the
 * character, the product noun and the newest model, and give up the descriptor
 * and the older generations first. MagSafe is dropped before either of those.
 *
 * {@link truncateDescription} may append an ellipsis, so a title with no
 * device clause is clipped one character inside the leaf max.
 */
const SERP_NOUNS = [
  "AirPods Case",
  "iPhone Case",
  "Phone Case",
  "Samsung Case",
  "Pixel Case",
  "iPad Case",
  "MacBook Case",
  "Kindle Case",
  "Apple Watch Band",
  "Apple Accessory",
  "Case",
] as const;

function charLength(value: string): number {
  return Array.from(value).length;
}

/** "iPhone 18 17 16 15 Pro Max" → "iPhone 18 Pro Max". Unrecognised phrases pass through. */
function newestSerpDevice(coverage: string): string {
  const match = coverage.match(
    /^iPhone\s+(\d+(?:\s+\d+)*)(?:\s+(Pro Max|Pro))?$/,
  );
  if (!match) return coverage;
  const newest = match[1]!.split(/\s+/)[0];
  return `iPhone ${newest}${match[2] ? ` ${match[2]}` : ""}`;
}

/**
 * Pull the product noun out of a title head, even when words follow it
 * (`Case with Charm`). The longest noun wins, so "Phone Case" beats "Case".
 */
function splitSerpHead(head: string): {
  prefix: string;
  noun: string;
  tail: string;
} {
  let best: { index: number; noun: string } | null = null;
  for (const noun of SERP_NOUNS) {
    const index = head.lastIndexOf(noun);
    if (index === -1) continue;
    const before = index === 0 || head[index - 1] === " ";
    const afterIndex = index + noun.length;
    const after = afterIndex === head.length || head[afterIndex] === " ";
    if (!before || !after) continue;
    if (
      !best ||
      noun.length > best.noun.length ||
      (noun.length === best.noun.length && index > best.index)
    ) {
      best = { index, noun };
    }
  }
  if (!best) return { prefix: head, noun: "", tail: "" };
  return {
    prefix: head.slice(0, best.index).trimEnd(),
    noun: best.noun,
    tail: head.slice(best.index + best.noun.length).trim(),
  };
}

/** Shorten at a word boundary. No ellipsis — this fragment sits inside a title. */
function clampSerpWords(text: string, max: number): string {
  if (charLength(text) <= max) return text;
  if (max <= 0) return "";
  const clipped = Array.from(text).slice(0, max + 1).join("");
  const boundary = clipped.lastIndexOf(" ");
  const safe =
    boundary >= Math.floor(max * 0.5)
      ? clipped.slice(0, boundary)
      : Array.from(text).slice(0, max).join("");
  return safe.trimEnd();
}

export function productSerpTitle(productTitle: string): string {
  const clean = productTitle.replace(/\s+/g, " ").trim();
  if (charLength(clean) <= SERP_TITLE_LEAF_MAX) return clean;

  let body = clean;
  let magsafe = false;
  if (body.endsWith(MAGSAFE_TITLE_SUFFIX)) {
    magsafe = true;
    body = body.slice(0, -MAGSAFE_TITLE_SUFFIX.length).trimEnd();
  }

  const forAt = body.lastIndexOf(" for iPhone ");
  if (forAt === -1) {
    return truncateDescription(clean, SERP_TITLE_LEAF_MAX - 1);
  }

  const head = body.slice(0, forAt).trim();
  const device = newestSerpDevice(body.slice(forAt + " for ".length).trim());
  const { prefix, noun, tail } = splitSerpHead(head);
  const nounPart = noun ? ` ${noun}` : "";
  const tailPart = tail ? ` ${tail}` : "";
  const assemble = (nextPrefix: string, withTail: boolean, withMagsafe: boolean) =>
    `${nextPrefix}${nounPart}${withTail ? tailPart : ""} for ${device}${
      withMagsafe ? MAGSAFE_TITLE_SUFFIX : ""
    }`.trim();

  if (charLength(assemble(prefix, true, magsafe)) <= SERP_TITLE_LEAF_MAX) {
    return assemble(prefix, true, magsafe);
  }
  if (charLength(assemble(prefix, true, false)) <= SERP_TITLE_LEAF_MAX) {
    return assemble(prefix, true, false);
  }
  if (charLength(assemble(prefix, false, false)) <= SERP_TITLE_LEAF_MAX) {
    return assemble(prefix, false, false);
  }

  const budget =
    SERP_TITLE_LEAF_MAX - charLength(` for ${device}`) - charLength(nounPart);
  const nextPrefix = clampSerpWords(prefix, budget);
  const fitted = assemble(nextPrefix, false, false);
  if (nextPrefix.length > 0 && charLength(fitted) <= SERP_TITLE_LEAF_MAX) {
    return fitted;
  }
  return truncateDescription(clean, SERP_TITLE_LEAF_MAX - 1);
}

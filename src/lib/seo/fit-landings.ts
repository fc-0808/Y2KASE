/**
 * Indexable iPhone 18 landings.
 *
 * Search Console's non-brand queries are not "phone cases". They are a
 * character plus a specific model: "hello kitty iphone 18 pro case",
 * "sanrio iphone 18 pro max case", "kuromi iphone 18 pro max case".
 * `/collections/{character}` owns the character head term. These URLs own
 * the model phrase, and only for the characters that already earn impressions.
 *
 * Every active iPhone case is sold for both iPhone 18 Pro and iPhone 18 Pro
 * Max, and there is no base iPhone 18 mould. One page per character covers
 * both models. A separate Pro page and Pro Max page would be the same grid.
 */

import { FREE_SHIPPING_OFFER, IPHONE_FIT } from "@/lib/pricing";

export const IPHONE_18_FIT_SLUG = "iphone-18-pro";

export const IPHONE_18_COLLECTIONS = [
  { slug: "hello-kitty", name: "Hello Kitty" },
  { slug: "sanrio", name: "Sanrio" },
  { slug: "kuromi", name: "Kuromi" },
] as const;

export type Iphone18CollectionSlug =
  (typeof IPHONE_18_COLLECTIONS)[number]["slug"];

const FIT_NOTES: Record<Iphone18CollectionSlug, string> = {
  "hello-kitty":
    "This page is Hello Kitty phone cases only — the red bow and the classic palette — not the rest of the Sanrio grid, and not Hello Kitty AirPods cases.",
  sanrio:
    "Sanrio on this page is the whole crew that fits iPhone 18: Hello Kitty, Kuromi, My Melody, Cinnamoroll and the other characters filed under Sanrio. One character, searched by name, has its own iPhone 18 page.",
  kuromi:
    "Every case here is Kuromi — purple, black, the skull hood — cut for iPhone 18 Pro and iPhone 18 Pro Max. Hello Kitty stays on her own iPhone 18 page.",
};

export function isIphone18FitSlug(value: string): boolean {
  return value === IPHONE_18_FIT_SLUG;
}

export function isIphone18CollectionSlug(
  value: string,
): value is Iphone18CollectionSlug {
  return IPHONE_18_COLLECTIONS.some((entry) => entry.slug === value);
}

export function iphone18FitPath(collectionSlug: string): string {
  return `/collections/${collectionSlug}/${IPHONE_18_FIT_SLUG}`;
}

/** Title leaf and H1. Must fit in front of the layout's ` · Y2KASE`. */
export function iphone18FitHeading(name: string): string {
  return `${name} iPhone 18 Pro and Pro Max Cases`;
}

export type Iphone18FitCopy = {
  title: string;
  heading: string;
  description: string;
  tagline: string;
  primary: string;
  paragraphs: string[];
  faqs: { question: string; answer: string }[];
};

export function iphone18FitCopy(
  name: string,
  slug: Iphone18CollectionSlug,
): Iphone18FitCopy {
  const heading = iphone18FitHeading(name);
  return {
    title: heading,
    heading,
    description: `${heading} at Y2KASE. There is no base iPhone 18 case — choose iPhone 18 Pro or iPhone 18 Pro Max on the product page. ${FREE_SHIPPING_OFFER}.`,
    tagline:
      "Fits iPhone 18 Pro and iPhone 18 Pro Max. The camera cutout is not shared — pick the exact model on the product page.",
    primary: `${name} iphone 18 pro cases`.toLowerCase(),
    paragraphs: [
      `${heading} are the ${name} designs sold for Apple's iPhone 18 lineup. This shop does not cut a base iPhone 18 case. iPhone 18 here is Pro and Pro Max only. The same artwork is offered for both, and the model is chosen on the product page so the camera opening matches the phone.`,
      FIT_NOTES[slug],
      `These products also list earlier phones where the mould exists — ${IPHONE_FIT.through}. This URL is the iPhone 18 cut, so AirPods cases stay on the main ${name} collection. MagSafe is a mark on the product after review, not a promise of the character.`,
    ],
    faqs: [
      {
        question: `Do you have a ${name} case for iPhone 18?`,
        answer: `Yes — iPhone 18 Pro and iPhone 18 Pro Max. There is no base iPhone 18 case in this shop. Select iPhone 18 Pro or iPhone 18 Pro Max on the product page.`,
      },
      {
        question: `Will a ${name} iPhone 18 Pro case fit an iPhone 18 Pro Max?`,
        answer:
          "No. The camera layout is different. Choose iPhone 18 Pro Max on the same product if that is the phone you have. The design is offered for both models.",
      },
      {
        question: `Are ${name} iPhone 18 Pro cases MagSafe?`,
        answer:
          "Only when the product is marked MagSafe. That mark means the case snaps to a MagSafe charger or wallet. An unmarked case is a regular cover.",
      },
    ],
  };
}

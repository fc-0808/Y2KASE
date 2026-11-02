/**
 * Indexable iPhone 18 landings.
 *
 * Search Console's non-brand queries are not "phone cases". They are a
 * character plus a specific model: "hello kitty iphone 18 pro case",
 * "sanrio iphone 18 pro max case", "kuromi iphone 18 pro max case".
 * `/collections/{character}` owns the character head term. These URLs own
 * the model phrase.
 *
 * Hello Kitty leads with iPhone 18 Pro. Sanrio and Kuromi lead with
 * iPhone 18 Pro Max, because that is the query those pages are shown for.
 * The other characters use the Hello Kitty shape: the character, then
 * iPhone 18 Pro, then Pro Max. One page still covers both models.
 *
 * Every active iPhone case is sold for both iPhone 18 Pro and iPhone 18 Pro
 * Max, and there is no base iPhone 18 mould. One page per character covers
 * both models. A separate Pro page and Pro Max page would be the same grid.
 */

import { FREE_SHIPPING_OFFER, IPHONE_FIT } from "@/lib/pricing";

export const IPHONE_18_FIT_SLUG = "iphone-18-pro";

export const IPHONE_18_COLLECTIONS = [
  { slug: "hello-kitty", name: "Hello Kitty", lead: "pro" },
  { slug: "sanrio", name: "Sanrio", lead: "pro-max" },
  { slug: "kuromi", name: "Kuromi", lead: "pro-max" },
  { slug: "my-melody", name: "My Melody", lead: "pro" },
  { slug: "cinnamoroll", name: "Cinnamoroll", lead: "pro" },
  { slug: "pompompurin", name: "Pompompurin", lead: "pro" },
  { slug: "miffy", name: "Miffy", lead: "pro" },
  { slug: "tamagotchi", name: "Tamagotchi", lead: "pro" },
] as const;

export type Iphone18CollectionSlug =
  (typeof IPHONE_18_COLLECTIONS)[number]["slug"];

const FIT_NOTES: Record<Iphone18CollectionSlug, string> = {
  "hello-kitty":
    "This page is Hello Kitty phone cases only — the red bow and the classic palette — not the rest of the Sanrio grid, and not Hello Kitty AirPods cases.",
  sanrio:
    "Sanrio on this page is the whole crew that fits iPhone 18: Hello Kitty, Kuromi, My Melody, Cinnamoroll, Pompompurin and the other characters filed under Sanrio. One character, searched by name, has its own iPhone 18 page.",
  kuromi:
    "Every case here is Kuromi — purple, black, the skull hood — cut for iPhone 18 Pro Max and iPhone 18 Pro. Hello Kitty stays on her own iPhone 18 page.",
  "my-melody":
    "Every case here is My Melody — the pink hood and the bow — cut for iPhone 18 Pro and iPhone 18 Pro Max. Kuromi and Hello Kitty stay on their own iPhone 18 pages, and My Melody AirPods stay on the main My Melody collection.",
  cinnamoroll:
    "Every case here is Cinnamoroll — the white puppy with the blue eyes and floppy ears — cut for iPhone 18 Pro and iPhone 18 Pro Max. Hello Kitty and Kuromi stay on their own iPhone 18 pages.",
  pompompurin:
    "Every case here is Pompompurin — the yellow beret and the pudding dog — cut for iPhone 18 Pro and iPhone 18 Pro Max. The other Sanrio characters stay on their own iPhone 18 pages, and Pompompurin AirPods stay on the main Pompompurin collection.",
  miffy:
    "Every case here is Miffy, Dick Bruna's line-drawn bunny, cut for iPhone 18 Pro and iPhone 18 Pro Max. This is not a Sanrio page. Miffy AirPods stay on the main Miffy collection.",
  tamagotchi:
    "Every case here is Tamagotchi — the original digital-pet shell — cut for iPhone 18 Pro and iPhone 18 Pro Max. The broader Y2K collection is the era and the shine, not this character.",
};

function modelPhrase(lead: "pro" | "pro-max"): string {
  return lead === "pro-max"
    ? "iPhone 18 Pro Max and Pro Cases"
    : "iPhone 18 Pro and Pro Max Cases";
}

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
  const entry = IPHONE_18_COLLECTIONS.find((item) => item.name === name);
  return `${name} ${modelPhrase(entry?.lead ?? "pro")}`;
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
  const entry = IPHONE_18_COLLECTIONS.find((item) => item.slug === slug);
  const heading = iphone18FitHeading(name);
  const primary =
    entry?.lead === "pro-max"
      ? `${name} iphone 18 pro max case`
      : `${name} iphone 18 pro case`;
  return {
    title: heading,
    heading,
    description: `${heading} at Y2KASE. There is no base iPhone 18 case — choose iPhone 18 Pro or iPhone 18 Pro Max on the product page. ${FREE_SHIPPING_OFFER}.`,
    tagline:
      "Fits iPhone 18 Pro and iPhone 18 Pro Max. The camera cutout is not shared — pick the exact model on the product page.",
    primary: primary.toLowerCase(),
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

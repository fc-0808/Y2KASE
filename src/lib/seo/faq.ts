/**
 * Public FAQ — one list for visible HTML and FAQPage JSON-LD.
 *
 * Google requires the structured-data answers to match what shoppers read.
 * Policy and catalog links are applied in {@link faqAnswerSegments} so the
 * stored strings stay the same in both channels.
 */
import { SUPPORT_EMAIL } from "@/lib/support/constants";
import {
  SHIPPING_ESTIMATE_SUMMARY,
  SHIPPING_MARKETS_SUMMARY,
} from "@/lib/shipping";
import { ROUTES } from "@/lib/routes";
import { IPHONE_FIT } from "@/lib/pricing";

export type FaqItem = {
  question: string;
  answer: string;
};

export type FaqSection = {
  heading: string;
  items: FaqItem[];
};

export const FAQ_SECTIONS: FaqSection[] = [
  {
    heading: "Orders & Shipping",
    items: [
      {
        question: "How long does shipping take?",
        answer: `${SHIPPING_ESTIMATE_SUMMARY} See our Shipping Policy for full details.`,
      },
      {
        question: "Can I track my order?",
        answer:
          "Yes — all orders include a tracking number sent to your email once dispatched.",
      },
      {
        question: "Where does Y2KASE ship?",
        answer: `We currently ship to ${SHIPPING_MARKETS_SUMMARY}. Available rates and any free-shipping threshold appear at checkout.`,
      },
    ],
  },
  {
    heading: "MagSafe & products",
    items: [
      {
        question: "How does Y2KASE decide a case is MagSafe?",
        answer:
          "We do not tag MagSafe because the word appears in a title. A case is tagged MagSafe only when a human confirms it, or a dedicated photo review sees admissible evidence — a magnet ring, MagSafe text on the product, or an accessory snapped on — at high confidence. Ambiguous photos go to a review queue and stay unmarked on the live shop. That tag is ours, not Apple certification. The process is in How we verify MagSafe. Shop the tagged set on MagSafe phone cases.",
      },
      {
        question: "Are MagSafe-tagged cases compatible with MagSafe chargers?",
        answer:
          "Cases marked MagSafe are meant to snap to MagSafe chargers. Unmarked cases should not be expected to hold a charger magnetically. Third-party chargers still vary; the badge means we confirmed a ring on that product.",
      },
      {
        question: "Will a MagSafe-tagged case work with MagSafe wallets?",
        answer:
          "A MagSafe-tagged case has the ring MagSafe wallets use. Wallet brands differ in pull strength. If MagSafe is not marked on the product, do not assume a wallet will snap on.",
      },
      {
        question: "Are the charms MagSafe?",
        answer:
          "No. Charms attach with a keyring-style clip and can be removed or swapped. MagSafe is a case feature (and, on some products, a MagSafe grip). Some cases also sell the charm separately as a variant.",
      },
      {
        question: "Which iPhone models are compatible?",
        answer: `Most cases are available for ${IPHONE_FIT.listed} series (including Pro and Pro Max). The specific models are listed on each product page. See iPhone cases for the device landing page.`,
      },
      {
        question: 'What is the "Case + Grip + Charm" option?',
        answer:
          "This bundle includes the case, a MagSafe-compatible pop grip, and a character charm. You can also choose just the case, or the case with only the grip or charm — select your preferred combination from the style selector on the product page.",
      },
    ],
  },
  {
    heading: "Returns & Refunds",
    items: [
      {
        question: "What is your return policy?",
        answer:
          "We accept returns within 30 days of delivery for unused items in original condition. See our Refund Policy for full details.",
      },
      {
        question: "My item arrived damaged — what do I do?",
        answer: `We're so sorry! Please email us at ${SUPPORT_EMAIL} within 7 days of delivery with photos of the damage and your order number. We'll arrange a replacement promptly.`,
      },
    ],
  },
];

/** Flat list for FAQPage JSON-LD — same strings as the visible sections. */
export const FAQ_ITEMS: FaqItem[] = FAQ_SECTIONS.flatMap(
  (section) => section.items,
);

export type FaqAnswerSegment =
  | { type: "text"; text: string }
  | { type: "link"; text: string; href: string };

/** Longest phrase first so "MagSafe phone cases" wins over a shorter token. */
const FAQ_PHRASES: { phrase: string; href: string }[] = [
  { phrase: "How we verify MagSafe", href: "/blog/how-we-verify-magsafe" },
  { phrase: "MagSafe phone cases", href: "/collections/magsafe" },
  { phrase: "Shipping Policy", href: "/policies/shipping-policy" },
  { phrase: "Refund Policy", href: "/policies/refund-policy" },
  { phrase: "iPhone cases", href: "/devices/iphone" },
  { phrase: "What's in the catalog", href: ROUTES.insights },
  { phrase: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` },
].sort((a, b) => b.phrase.length - a.phrase.length);

/**
 * Split an FAQ answer into text and link segments. The joined text of the
 * segments is identical to the input, so JSON-LD and HTML cannot drift.
 */
export function faqAnswerSegments(answer: string): FaqAnswerSegment[] {
  const segments: FaqAnswerSegment[] = [];
  let remaining = answer;

  while (remaining.length > 0) {
    let hit: { index: number; phrase: string; href: string } | null = null;
    for (const { phrase, href } of FAQ_PHRASES) {
      const index = remaining.indexOf(phrase);
      if (index < 0) continue;
      if (!hit || index < hit.index) hit = { index, phrase, href };
    }
    if (!hit) {
      segments.push({ type: "text", text: remaining });
      break;
    }
    if (hit.index > 0) {
      segments.push({ type: "text", text: remaining.slice(0, hit.index) });
    }
    segments.push({ type: "link", text: hit.phrase, href: hit.href });
    remaining = remaining.slice(hit.index + hit.phrase.length);
  }

  return segments;
}

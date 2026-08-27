import { BUNDLE, resolveBroadcastCoupon } from "@/lib/promotions";
import type { MarketingDraft } from "./types";

export const BUNDLE_MARKETING = {
  name: BUNDLE.label,
  qualifyingItems: BUNDLE.groupSize,
  freeItems: BUNDLE.freePerGroup,
  eligibleProductCopy: BUNDLE.eligibleProductCopy,
  collectionUrl: `https://y2kase.com${BUNDLE.landingPath}`,
  automatic: BUNDLE.automatic,
  repeatEveryGroup: BUNDLE.repeatEveryGroup,
  stackableWithCoupons: BUNDLE.stackableWithCoupons,
} as const;

export function isBuyTwoGetTwoOfferText(value: string): boolean {
  const text = value.replace(/\s+/g, " ");
  return (
    /\bbuy\s*2\s*(?:,|&|\+|and)?\s*get\s*2\s*free\b/i.test(text) ||
    /\bbuy\s*(?:4|four)\s*(?:,|&|\+|and)?\s*pay\s*(?:for\s*)?(?:2|two)\b/i.test(
      text,
    ) ||
    /\b(?:add|choose|pick)\s*(?:4|four)\b.{0,80}\b(?:2|two)\b.{0,40}\b(?:free|on us)\b/i.test(
      text,
    )
  );
}

export function isBuyTwoGetTwoCampaign(input: {
  offer?: string;
  brief?: string;
  draft: MarketingDraft;
}): boolean {
  return isBuyTwoGetTwoOfferText(
    [
      input.offer,
      input.brief,
      input.draft.name,
      input.draft.subject,
      input.draft.previewText,
      input.draft.eyebrow,
      input.draft.heading,
      input.draft.body,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

/**
 * Authoritative facts injected above operator prose. Marketing copy must match
 * the checkout engine, not an AI's interpretation of "Buy 2 Get 2".
 */
export function bundleOfferPromptContext(): string {
  return [
    `Canonical offer name: ${BUNDLE_MARKETING.name}`,
    `Mechanic: add any ${BUNDLE_MARKETING.qualifyingItems} ${BUNDLE_MARKETING.eligibleProductCopy}; the ${BUNDLE_MARKETING.freeItems} lowest-priced items across the cart are free.`,
    "Application: automatic in the bag and at checkout; no promo code is needed.",
    "Stacking: coupon codes cannot be combined with the active bundle.",
    `Primary destination: ${BUNDLE_MARKETING.collectionUrl}`,
    "Do not mention the repeating 8→4 tier unless the operator explicitly asks for it.",
  ].join("\n");
}

export function knownCouponPromptContext(code: string): string | null {
  const coupon = resolveBroadcastCoupon(code);
  if (!coupon) return null;
  return [
    `Verified code: ${coupon.code}`,
    `Verified discount: ${coupon.percentOff}% off`,
    coupon.minSubtotalCents
      ? `Minimum subtotal: ${(coupon.minSubtotalCents / 100).toFixed(2)}`
      : "Minimum subtotal: none configured",
    "Do not invent an expiry date.",
  ].join("\n");
}

export function bundleMechanicsCoverage(text: string): {
  itemCount: boolean;
  freeCount: boolean;
  automatic: boolean;
  repeating: boolean;
  nonStacking: boolean;
} {
  const normalized = text.replace(/\s+/g, " ");
  return {
    itemCount:
      /\b(?:4|four)\b/i.test(normalized) &&
      /\b(?:cases?|grips?|charms?|items?|picks?)\b/i.test(normalized),
    freeCount:
      /\b(?:2|two)\s+(?:cheapest|lowest-priced|lowest priced)\b/i.test(
        normalized,
      ) && /\b(?:free|on us)\b/i.test(normalized),
    automatic: /\b(?:automatic(?:ally)?|no (?:promo )?code)\b/i.test(
      normalized,
    ),
    repeating:
      /\b(?:for )?every\s*(?:4|four)\b.{0,40}\b(?:2|two)\b.{0,30}\b(?:free|on us)\b/i.test(
        normalized,
      ),
    nonStacking:
      /\b(?:coupon|promo)\s*codes?\b.{0,45}\b(?:cannot|can't|can’t|do not|don't|don’t|not)\b.{0,25}\b(?:stack|combine|combined)\b/i.test(
        normalized,
      ) ||
      /\b(?:cannot|can't|can’t)\s+(?:be\s+)?(?:stacked|combined)\s+with\s+(?:coupon|promo)\s*codes?\b/i.test(
        normalized,
      ),
  };
}

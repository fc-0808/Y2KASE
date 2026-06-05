/**
 * Coupon resolution — SERVER ONLY.
 *
 * Looks up a customer-entered promo code against Stripe's active promotion
 * codes and returns the underlying discount so we can (a) preview it on the
 * cart page and (b) pre-apply it to the Checkout Session. Stripe remains the
 * source of truth and re-validates every restriction at payment time.
 */
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";

export type ResolvedCoupon = {
  /** The customer-facing code, normalised to how Stripe stores it. */
  code: string;
  /** Stripe promotion code id (promo_…) passed to Checkout `discounts`. */
  promotionCodeId: string;
  percentOff: number | null;
  amountOffCents: number | null;
  /** Currency required for an amount_off coupon (lowercase ISO), else null. */
  currency: string | null;
  /** Minimum order subtotal (cents) required, if the code restricts it. */
  minimumCents: number | null;
  /** Short human label, e.g. "10% off" or "$5.00 off". */
  label: string;
};

/** Look up an active promotion code by its customer-facing string. */
export async function resolvePromotionCode(
  rawCode: string,
): Promise<ResolvedCoupon | null> {
  const code = rawCode?.trim();
  if (!code) return null;

  const stripe = getStripe();
  const list = await stripe.promotionCodes.list({
    code,
    active: true,
    limit: 1,
  });
  const pc = list.data[0];
  if (!pc || !pc.active) return null;

  // Resolve the underlying coupon. The pinned API version returns the coupon as
  // an id under `promotion.coupon`; older versions exposed `pc.coupon` directly.
  const promotion = (pc as unknown as { promotion?: { coupon?: unknown } })
    .promotion;
  const legacyCoupon = (pc as unknown as { coupon?: Stripe.Coupon }).coupon;

  let coupon: Stripe.Coupon | null = null;
  if (promotion?.coupon && typeof promotion.coupon === "object") {
    coupon = promotion.coupon as Stripe.Coupon;
  } else if (typeof promotion?.coupon === "string") {
    coupon = await stripe.coupons.retrieve(promotion.coupon);
  } else if (legacyCoupon) {
    coupon = legacyCoupon;
  }
  if (!coupon || !coupon.valid) return null;

  const percentOff = coupon.percent_off ?? null;
  const amountOffCents = coupon.amount_off ?? null;
  const currency = coupon.currency ?? null;
  const minimumCents = pc.restrictions?.minimum_amount ?? null;

  const label = percentOff
    ? `${percentOff}% off`
    : amountOffCents
      ? `$${(amountOffCents / 100).toFixed(2)} off`
      : "Discount";

  return {
    code: pc.code,
    promotionCodeId: pc.id,
    percentOff,
    amountOffCents,
    currency,
    minimumCents,
    label,
  };
}

/**
 * Compute the discount (in cents) a resolved coupon applies to a given subtotal.
 * Mirrors how Stripe discounts line items (subtotal only — never shipping).
 */
export function discountForSubtotal(
  coupon: ResolvedCoupon,
  subtotalCents: number,
  currency: string,
): { discountCents: number; eligible: boolean; reason?: string } {
  if (coupon.minimumCents && subtotalCents < coupon.minimumCents) {
    return {
      discountCents: 0,
      eligible: false,
      reason: `Spend $${(coupon.minimumCents / 100).toFixed(2)} to use this code.`,
    };
  }
  if (
    coupon.amountOffCents != null &&
    coupon.currency &&
    coupon.currency.toLowerCase() !== currency.toLowerCase()
  ) {
    return {
      discountCents: 0,
      eligible: false,
      reason: "This code isn't valid for your currency.",
    };
  }

  let discountCents = 0;
  if (coupon.percentOff != null) {
    discountCents = Math.round((subtotalCents * coupon.percentOff) / 100);
  } else if (coupon.amountOffCents != null) {
    discountCents = Math.min(coupon.amountOffCents, subtotalCents);
  }
  return { discountCents, eligible: true };
}

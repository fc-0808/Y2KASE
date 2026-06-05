/**
 * POST /api/coupon — validate a promo code and preview its discount.
 *
 * The cart page calls this so the buyer sees the discount applied BEFORE they
 * leave for Stripe. The real, authoritative discount is applied again on the
 * Checkout Session in /api/checkout (Stripe re-validates all restrictions).
 */
import { NextResponse, type NextRequest } from "next/server";
import { isStripeConfigured } from "@/lib/stripe";
import { resolvePromotionCode, discountForSubtotal } from "@/lib/coupon";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ valid: false, error: "Promo codes are unavailable right now." });
  }

  let body: { code?: string; subtotalCents?: number; currency?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ valid: false, error: "Invalid request." }, { status: 400 });
  }

  const code = (body.code ?? "").trim();
  const subtotalCents = Math.max(0, Math.floor(Number(body.subtotalCents) || 0));
  const currency = (body.currency ?? "USD").toUpperCase();

  if (!code) {
    return NextResponse.json({ valid: false, error: "Enter a code." });
  }

  try {
    const coupon = await resolvePromotionCode(code);
    if (!coupon) {
      return NextResponse.json({ valid: false, error: "That code isn't valid." });
    }

    const { discountCents, eligible, reason } = discountForSubtotal(
      coupon,
      subtotalCents,
      currency,
    );
    if (!eligible) {
      return NextResponse.json({ valid: false, error: reason ?? "Code not eligible." });
    }

    return NextResponse.json({
      valid: true,
      code: coupon.code,
      label: coupon.label,
      discountCents,
    });
  } catch (err) {
    console.error("[coupon] validation failed:", err);
    return NextResponse.json(
      { valid: false, error: "Couldn't check that code. Try again." },
      { status: 500 },
    );
  }
}

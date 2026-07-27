/**
 * POST /api/coupon — validate a promo code and preview its discount.
 *
 * Discounts are computed LOCALLY (see `@/lib/promotions`), not against Stripe.
 * The cart page validates codes instantly on the client with the same engine;
 * this endpoint mirrors that logic so any server-side or third-party caller
 * (and defense-in-depth) gets an identical, authoritative answer. The final
 * charge is always recomputed in /api/checkout from the server-priced cart.
 */
import { NextResponse, type NextRequest } from "next/server";
import { resolveLocalCoupon } from "@/lib/promotions";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: { code?: string; subtotalCents?: number; currency?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { valid: false, error: "Invalid request." },
      { status: 400 },
    );
  }

  const code = (body.code ?? "").trim();
  const subtotalCents = Math.max(0, Math.floor(Number(body.subtotalCents) || 0));

  if (!code) {
    return NextResponse.json({ valid: false, error: "Enter a code." });
  }

  const coupon = resolveLocalCoupon(code);
  if (!coupon) {
    return NextResponse.json({ valid: false, error: "That code isn't valid." });
  }

  if (coupon.minSubtotalCents && subtotalCents < coupon.minSubtotalCents) {
    return NextResponse.json({
      valid: false,
      error: `Spend $${(coupon.minSubtotalCents / 100).toFixed(2)} to use this code.`,
    });
  }

  const discountCents = Math.round(
    (subtotalCents * coupon.percentOff) / 100,
  );

  return NextResponse.json({
    valid: true,
    code: coupon.code,
    label: coupon.label,
    discountCents,
  });
}

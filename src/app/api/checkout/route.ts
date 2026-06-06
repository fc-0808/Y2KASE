/**
 * POST /api/checkout
 *
 * Creates a Stripe Checkout Session from the buyer's cart and returns the hosted
 * checkout URL. Flow (the pattern used by Shopify / CASETiFY / every serious DTC store):
 *
 *   1. Re-price the cart SERVER-SIDE from the DB (never trust client prices).
 *   2. Persist a `pending` order + order_items so we have a durable record.
 *   3. Create a Stripe Checkout Session referencing that order via metadata.
 *   4. Return { url } — the client redirects the browser to Stripe.
 *
 * Fulfillment (marking the order paid) happens asynchronously and idempotently
 * in /api/webhooks/stripe on `checkout.session.completed`. We do NOT mark orders
 * paid here, because the user could abandon the Stripe page.
 */
import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { orders, orderItems } from "@/lib/db/schema";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { priceCart, CheckoutError, type CheckoutLineInput } from "@/lib/checkout";
import { resolvePromotionCode } from "@/lib/coupon";
import { getSession } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

// Stripe's SDK needs Node APIs (crypto) — not the edge runtime.
export const runtime = "nodejs";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

// Where Stripe Checkout can ship to. Expand as the brand opens new markets.
const SHIPPING_COUNTRIES: Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] =
  ["US", "CA", "GB", "AU", "HK", "SG", "JP", "DE", "FR", "NL", "NZ"];

export async function POST(request: NextRequest) {
  // Each session create costs a Stripe API call + a DB write, so cap bursts.
  const limited = enforceRateLimit(request, "checkout", {
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Checkout is not available right now." },
      { status: 503 },
    );
  }

  let body: { items?: CheckoutLineInput[]; promotionCode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const cart = await priceCart(body.items ?? []);

    // Resolve an optional promo code to a Stripe promotion code id. If valid we
    // pre-apply it via `discounts`; otherwise we let the buyer enter one on the
    // Stripe page via `allow_promotion_codes` (the two are mutually exclusive).
    let promotionCodeId: string | null = null;
    if (body.promotionCode?.trim()) {
      const resolved = await resolvePromotionCode(body.promotionCode);
      if (resolved) promotionCodeId = resolved.promotionCodeId;
    }

    // Tie the order to a logged-in user if there is one (guests are fine too).
    const session = await getSession(await headers());
    const userId = session?.user?.id ?? null;

    // 1) Persist a pending order first so we never lose a paid transaction.
    const [order] = await db
      .insert(orders)
      .values({
        userId,
        email: session?.user?.email ?? "",
        status: "pending",
        subtotalCents: cart.subtotalCents,
        shippingCents: cart.shippingCents,
        taxCents: 0,
        totalCents: cart.totalCents,
        currency: cart.currency,
      })
      .returning({ id: orders.id });

    await db.insert(orderItems).values(
      cart.lines.map((l) => ({
        orderId: order.id,
        productId: l.productId,
        productSlug: l.slug,
        productTitle: l.title,
        imageUrl: l.imageUrl,
        optionValues: l.options,
        quantity: l.quantity,
        unitCents: l.unitCents,
      })),
    );

    // 2) Build Stripe line items from the SERVER-priced cart.
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
      cart.lines.map((l) => {
        const optionLabel = Object.entries(l.options)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" · ");
        return {
          quantity: l.quantity,
          price_data: {
            currency: l.currency.toLowerCase(),
            unit_amount: l.unitCents,
            product_data: {
              name: l.title,
              ...(optionLabel ? { description: optionLabel } : {}),
              ...(l.imageUrl ? { images: [l.imageUrl] } : {}),
              metadata: { productId: String(l.productId), slug: l.slug },
            },
          },
        };
      });

    // 3) Shipping as a Checkout shipping option (free over threshold).
    const shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] =
      [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            display_name:
              cart.shippingCents === 0 ? "Free shipping ✨" : "Standard shipping",
            fixed_amount: {
              amount: cart.shippingCents,
              currency: cart.currency.toLowerCase(),
            },
            delivery_estimate: {
              minimum: { unit: "business_day", value: 5 },
              maximum: { unit: "business_day", value: 12 },
            },
          },
        },
      ];

    const checkout = await getStripe().checkout.sessions.create({
      // Hosted Checkout (the default ui_mode) — Stripe-hosted, conversion-optimized,
      // auto-renders Apple Pay / Google Pay / Link with no extra integration.
      mode: "payment",
      line_items: lineItems,
      shipping_options: shippingOptions,
      shipping_address_collection: { allowed_countries: SHIPPING_COUNTRIES },
      phone_number_collection: { enabled: true },
      billing_address_collection: "auto",
      // Either pre-apply the entered code, or let them add one on Stripe — never both.
      ...(promotionCodeId
        ? { discounts: [{ promotion_code: promotionCodeId }] }
        : { allow_promotion_codes: true }),
      automatic_tax: { enabled: false },
      // Reconstruct & fulfill the order in the webhook.
      client_reference_id: String(order.id),
      metadata: { orderId: String(order.id) },
      payment_intent_data: { metadata: { orderId: String(order.id) } },
      ...(session?.user?.email
        ? { customer_email: session.user.email }
        : {}),
      success_url: `${SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/checkout/cancel?order_id=${order.id}`,
    });

    // Store the session id so the success page + webhook can reconcile.
    await db
      .update(orders)
      .set({ stripeSessionId: checkout.id, updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    if (!checkout.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }

    return NextResponse.json({ url: checkout.url });
  } catch (err) {
    if (err instanceof CheckoutError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[checkout] failed:", err);
    return NextResponse.json(
      { error: "Could not start checkout. Please try again." },
      { status: 500 },
    );
  }
}

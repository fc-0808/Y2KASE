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
import { computePromotions } from "@/lib/promotions";
import { getSession } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { SHIPPING_COUNTRIES } from "@/lib/shipping";
import {
  sanitizeUtmParams,
  utmToMetadata,
} from "@/lib/analytics/utm";

// Stripe's SDK needs Node APIs (crypto) — not the edge runtime.
export const runtime = "nodejs";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

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

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const body = parsed as {
    items?: CheckoutLineInput[];
    couponCode?: string;
    attribution?: unknown;
  };
  if (body.couponCode != null && typeof body.couponCode !== "string") {
    return NextResponse.json({ error: "Invalid coupon code." }, { status: 400 });
  }

  try {
    const cart = await priceCart(body.items ?? []);

    // Apply promotions with the SAME engine the cart preview uses, so the amount
    // we charge equals the amount the buyer saw to the cent. The engine enforces
    // mutual exclusivity (an entered coupon is ignored while the bundle is live)
    // and hands us a per-line charge plan we bake straight into the Stripe line
    // items — no Stripe promotion codes involved.
    const promo = computePromotions(
      cart.lines.map((l) => ({ unitCents: l.unitCents, quantity: l.quantity })),
      body.couponCode,
    );

    // Tie the order to a logged-in user if there is one (guests are fine too).
    const session = await getSession(await headers());
    const userId = session?.user?.id ?? null;

    // Coarse country from the edge geo header (Vercel populates this). Gives
    // even abandoned guest orders a location signal without storing raw IPs.
    const geoCountry =
      request.headers.get("x-vercel-ip-country")?.toUpperCase() || null;

    // The promotion only ever reduces line items — never shipping. Shipping is
    // still quoted off the GROSS subtotal (same as the cart preview), so the
    // final total is: discounted subtotal + shipping.
    const totalCents = promo.totalAfterDiscountCents + cart.shippingCents;
    const attribution = utmToMetadata(
      sanitizeUtmParams(body.attribution),
    );

    // 1) Persist a pending order first so we never lose a paid transaction.
    // `subtotalCents` stays gross; `totalCents` reflects the applied discount so
    // the admin record matches what Stripe actually charges.
    const [order] = await db
      .insert(orders)
      .values({
        userId,
        email: session?.user?.email ?? "",
        status: "pending",
        subtotalCents: cart.subtotalCents,
        shippingCents: cart.shippingCents,
        taxCents: 0,
        totalCents,
        currency: cart.currency,
        geoCountry,
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

    // 2) Build Stripe line items from the SERVER-priced cart with the discount
    // already baked in. Each line is split into its paid units (at the — possibly
    // %-reduced — unit price) and, for the bundle, its free units at $0. Stripe
    // therefore only ever receives finished math, so the charged total is exactly
    // `promo.totalAfterDiscountCents` + shipping.
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    cart.lines.forEach((l, i) => {
      const plan = promo.plans[i];
      const optionLabel = Object.entries(l.options)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ");
      const productData = (extra?: string) => ({
        name: l.title,
        ...(optionLabel || extra
          ? { description: [optionLabel, extra].filter(Boolean).join(" · ") }
          : {}),
        ...(l.imageUrl ? { images: [l.imageUrl] } : {}),
        metadata: { productId: String(l.productId), slug: l.slug },
      });

      if (plan.paidQty > 0) {
        lineItems.push({
          quantity: plan.paidQty,
          price_data: {
            currency: l.currency.toLowerCase(),
            unit_amount: plan.unitCents,
            product_data: productData(),
          },
        });
      }
      if (plan.freeQty > 0) {
        lineItems.push({
          quantity: plan.freeQty,
          price_data: {
            currency: l.currency.toLowerCase(),
            unit_amount: 0,
            product_data: productData("Bundle: Free ✨"),
          },
        });
      }
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
            // Delivery windows vary by destination (HK 1–3 days; supported
            // international markets up to 21). Stripe applies one estimate to
            // every allowed country, so omitting it is more accurate than
            // publishing a globally false 5–12 day promise. The linked shipping
            // policy and structured data carry the destination-specific ranges.
          },
        },
      ];

    const checkout = await getStripe().checkout.sessions.create({
      // Hosted Checkout (the default ui_mode) — Stripe-hosted, conversion-optimized,
      // auto-renders Apple Pay / Google Pay / Link with no extra integration.
      mode: "payment",
      line_items: lineItems,
      shipping_options: shippingOptions,
      shipping_address_collection: {
        allowed_countries: [
          ...SHIPPING_COUNTRIES,
        ] as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
      },
      phone_number_collection: { enabled: true },
      billing_address_collection: "auto",
      // Discounts are computed locally and already baked into the line items, so
      // Stripe's own promotion-code UI is intentionally disabled here (no
      // `allow_promotion_codes`, no `discounts`) — there is nothing left to stack.
      automatic_tax: { enabled: false },
      // Reconstruct & fulfill the order in the webhook.
      client_reference_id: String(order.id),
      metadata: { orderId: String(order.id), ...attribution },
      payment_intent_data: {
        metadata: { orderId: String(order.id), ...attribution },
      },
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

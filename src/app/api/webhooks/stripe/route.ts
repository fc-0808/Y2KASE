/**
 * POST /api/webhooks/stripe
 *
 * Stripe's source of truth for "did the customer actually pay?". This endpoint
 * is the ONLY place an order transitions to `paid`. The browser returning to
 * /checkout/success is NOT proof of payment — only a verified webhook is.
 *
 * Security:
 *  - We verify the Stripe-Signature header against STRIPE_WEBHOOK_SECRET. An
 *    unsigned/forged request is rejected with 400.
 *  - We read the RAW request body (await request.text()) because signature
 *    verification hashes the exact bytes Stripe sent — parsing as JSON first
 *    would change them and break verification.
 *
 * Idempotency:
 *  - Stripe may deliver the same event more than once. Marking an already-paid
 *    order paid again is a no-op, so this handler is safe to receive duplicates.
 */
import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, orderItems } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";
import { sendOrderConfirmationOnce } from "@/lib/email";
import { sendCapiPurchase } from "@/lib/analytics/meta-capi";
import { normalizeEmail } from "@/lib/email-address";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET is not set.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  // RAW body — required for signature verification.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      payload,
      signature,
      secret,
    );
  } catch (err) {
    console.error("[webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        // Only fulfill once payment is actually collected.
        if (
          session.payment_status === "paid" ||
          session.payment_status === "no_payment_required"
        ) {
          await markOrderPaid(session);
        }
        break;
      }

      case "checkout.session.async_payment_succeeded": {
        // Delayed payment methods (e.g. some bank-backed wallets) settle later.
        await markOrderPaid(event.data.object);
        break;
      }

      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const session = event.data.object;
        const orderId = orderIdFrom(session);
        if (orderId) {
          // Capture any contact details the shopper entered before leaving so
          // the admin console and abandoned-cart recovery still have a name to
          // work with — Stripe often has the email even on an expired session.
          await db
            .update(orders)
            .set({
              status: "cancelled",
              ...contactFrom(session),
              updatedAt: new Date(),
            })
            .where(eq(orders.id, orderId));
        }
        break;
      }

      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }
  } catch (err) {
    // Returning 500 makes Stripe retry — desirable for transient DB errors.
    console.error(`[webhook] handler error for ${event.type}:`, err);
    return NextResponse.json({ error: "Handler error." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

function orderIdFrom(session: Stripe.Checkout.Session): number | null {
  const raw = session.metadata?.orderId ?? session.client_reference_id;
  const id = raw ? Number(raw) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Extract the customer contact + shipping details Stripe collected on a session.
 * Only present keys are returned, so spreading this into a Drizzle `.set()` never
 * clobbers existing data with `undefined` (Drizzle omits undefined fields).
 */
function contactFrom(session: Stripe.Checkout.Session): {
  email?: string;
  shippingAddress?: NonNullable<(typeof orders.$inferInsert)["shippingAddress"]>;
} {
  const patch: {
    email?: string;
    shippingAddress?: NonNullable<(typeof orders.$inferInsert)["shippingAddress"]>;
  } = {};

  const email = session.customer_details?.email ?? session.customer_email;
  if (email) patch.email = normalizeEmail(email);

  const shipping = session.collected_information?.shipping_details ?? null;
  const address = shipping?.address;
  if (address) {
    patch.shippingAddress = {
      name: shipping?.name ?? session.customer_details?.name ?? "",
      line1: address.line1 ?? "",
      line2: address.line2 ?? undefined,
      city: address.city ?? "",
      state: address.state ?? undefined,
      postalCode: address.postal_code ?? "",
      country: address.country ?? "",
    };
  }

  return patch;
}

/** Idempotently mark an order paid + capture the address and payment intent. */
async function markOrderPaid(session: Stripe.Checkout.Session) {
  const orderId = orderIdFrom(session);
  if (!orderId) {
    console.error("[webhook] checkout session has no resolvable orderId.");
    return;
  }

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    columns: {
      id: true,
      totalCents: true,
      currency: true,
      stripeSessionId: true,
    },
  });
  if (!order) {
    throw new Error(`Order ${orderId} was not found for Stripe fulfillment.`);
  }

  const currency = session.currency?.toUpperCase() ?? null;
  if (
    order.stripeSessionId !== session.id ||
    session.amount_total !== order.totalCents ||
    currency !== order.currency.toUpperCase()
  ) {
    console.error("[webhook] checkout reconciliation failed", {
      orderId,
      sessionMatches: order.stripeSessionId === session.id,
      amountMatches: session.amount_total === order.totalCents,
      currencyMatches: currency === order.currency.toUpperCase(),
    });
    throw new Error(`Checkout reconciliation failed for order ${orderId}.`);
  }

  await db
    .update(orders)
    .set({
      status: "paid",
      ...contactFrom(session),
      stripePaymentIntentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  // Fire the confirmation email. Exactly-once + best-effort: never throws, so a
  // mail failure can't make Stripe retry an already-fulfilled order.
  const result = await sendOrderConfirmationOnce(orderId);
  console.log(`[webhook] order ${orderId} paid; confirmation email: ${result}`);

  // Server-side Meta CAPI purchase event — bypasses iOS 14 restrictions and
  // ad blockers for accurate purchase attribution. Deduplicated via event_id.
  const items = await db
    .select({
      productId: orderItems.productId,
      quantity: orderItems.quantity,
      unitCents: orderItems.unitCents,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  await sendCapiPurchase({
    orderId: String(orderId),
    totalCents: session.amount_total ?? 0,
    currency: session.currency ?? "usd",
    email: session.customer_details?.email ?? session.customer_email ?? undefined,
    items: items.map((i) => ({
      productId: String(i.productId ?? ""),
      quantity: i.quantity,
      unitCents: i.unitCents,
    })),
  });
}

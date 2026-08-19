/**
 * GET /api/cron/abandoned-cart — abandoned-cart recovery (Vercel Cron).
 *
 * Finds orders that were created, left in `pending`, and never paid, then sends
 * a one-click "finish your order" email. The key trick: we link the buyer
 * straight back to their still-open Stripe Checkout session, so they resume
 * payment in a single tap (the highest-converting recovery flow).
 *
 * Targeting window: created 1–24h ago. Younger than 1h is still "in progress";
 * older than 24h means the Stripe session has expired (default lifetime), so
 * there's nothing to resume.
 *
 * Cadence: two runs a day, twelve hours apart (see vercel.json, which cannot
 * carry comments). A single daily run cannot cover this window — a cart
 * abandoned in the hour before it is too young to email, and by the following
 * run it is older than 24h and its Stripe session has expired, so it is never
 * recovered. Two runs guarantee every cart is reachable while its session is
 * still open. Expressing that as two once-a-day entries rather than an hourly
 * expression is deliberate: hourly schedules are a paid Vercel feature, and the
 * atomic claim below makes the extra run free of duplicate-send risk.
 *
 * Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}` to cron requests
 * when CRON_SECRET is set. We reject anything else so the endpoint can't be
 * triggered to spam customers.
 *
 * Delivery safety: each pending order is atomically claimed and every provider
 * request carries a stable idempotency key, so overlapping/retried runs cannot
 * intentionally send the same reminder twice.
 */
import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq, gte, lte, isNull } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { emailSubscribers, orders } from "@/lib/db/schema";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { sendAbandonedCartEmail } from "@/lib/email";
import { marketingMailReadiness } from "@/lib/marketing/compliance";
import { isMarketingSendable } from "@/lib/marketing/audience";
import { unsubscribeUrl } from "@/lib/unsubscribe";

export const runtime = "nodejs";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // Fail closed when unconfigured.
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no-db" });
  }
  // Settle the commercial-mail prerequisites once per run rather than per
  // order. Claiming rows and retrieving Stripe sessions for a send that cannot
  // legally happen burns API quota and leaves the reason for an empty run
  // invisible.
  const readiness = marketingMailReadiness();
  if (!readiness.ready) {
    console.error(
      `[cron:abandoned-cart] withheld; unmet prerequisites: ${readiness.missing.join(", ")}.`,
    );
    return NextResponse.json({
      ok: true,
      sent: 0,
      reason: "marketing-not-ready",
      missing: readiness.missing,
    });
  }

  const now = Date.now();
  const windowStart = new Date(now - 24 * 60 * 60 * 1000); // 24h ago
  const windowEnd = new Date(now - 60 * 60 * 1000); // 1h ago

  const candidates = await db.query.orders.findMany({
    where: and(
      eq(orders.status, "pending"),
      isNull(orders.abandonedEmailSentAt),
      gte(orders.createdAt, windowStart),
      lte(orders.createdAt, windowEnd),
    ),
    with: { items: { columns: { productTitle: true, quantity: true } } },
    orderBy: [asc(orders.createdAt)],
    limit: 100,
  });

  let sent = 0;
  let skipped = 0;
  let suppressed = 0;

  for (const order of candidates) {
    // A cart-link fallback cannot recreate a localStorage bag on another
    // device. Only a live Stripe session is a valid one-click recovery target.
    if (!order.stripeSessionId || !isStripeConfigured()) {
      skipped++;
      continue;
    }

    let resumeUrl = "";
    let email = order.email?.trim() || "";

    try {
      const sess = await getStripe().checkout.sessions.retrieve(
        order.stripeSessionId,
      );
      if (sess.status === "complete" || sess.payment_status === "paid") {
        await claim(order.id);
        skipped++;
        continue;
      }
      if (sess.status !== "open" || !sess.url) {
        await claim(order.id);
        skipped++;
        continue;
      }

      resumeUrl = sess.url;
      const discovered = sess.customer_details?.email || "";
      email = email || discovered;
      // Backfill the email we just learned so the admin console shows a real
      // customer instead of a blank cell while the order is still pending.
      if (discovered && !order.email) {
        await db
          .update(orders)
          .set({ email: discovered, updatedAt: new Date() })
          .where(eq(orders.id, order.id));
      }
    } catch {
      // Stripe/network failures are retryable; never replace the secure resume
      // link with a cart URL that cannot restore this server-side checkout.
      skipped++;
      continue;
    }

    if (!email) {
      skipped++;
      continue; // No way to reach this shopper; leave it for a future run.
    }

    // This email is classified and sent as marketing. Require an active list
    // membership; an absent row is not consent, and an opt-out is suppression.
    const normalizedEmail = email.trim().toLowerCase();
    const subscriber = await db
      .select({
        status: emailSubscribers.status,
      })
      .from(emailSubscribers)
      .where(eq(emailSubscribers.email, normalizedEmail))
      .limit(1);
    if (!isMarketingSendable(subscriber[0])) {
      await claim(order.id);
      suppressed++;
      continue;
    }

    // Atomically claim before sending so concurrent runs can't double-email.
    const claimed = await claim(order.id);
    if (!claimed) {
      skipped++;
      continue;
    }

    const ok = await sendAbandonedCartEmail({
      to: normalizedEmail,
      items: order.items.map((it) => ({
        title: it.productTitle,
        quantity: it.quantity,
      })),
      resumeUrl,
      unsubscribeUrl: unsubscribeUrl(normalizedEmail),
      idempotencyKey: `abandoned-cart-order-${order.id}-v1`,
    });
    if (ok) sent++;
    else {
      // Resend can reject without throwing. Release our claim so a later cron
      // run can retry while the Stripe session is still recoverable.
      await releaseClaim(order.id);
      skipped++;
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: candidates.length,
    sent,
    skipped,
    suppressed,
  });
}

/** Atomically mark the reminder as sent. Returns true if this call won the claim. */
async function claim(orderId: number): Promise<boolean> {
  const rows = await db
    .update(orders)
    .set({ abandonedEmailSentAt: new Date() })
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.status, "pending"),
        isNull(orders.abandonedEmailSentAt),
      ),
    )
    .returning({ id: orders.id });
  return rows.length > 0;
}

async function releaseClaim(orderId: number): Promise<void> {
  await db
    .update(orders)
    .set({ abandonedEmailSentAt: null })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending")));
}

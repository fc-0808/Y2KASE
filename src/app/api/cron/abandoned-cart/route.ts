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
 * Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}` to cron requests
 * when CRON_SECRET is set. We reject anything else so the endpoint can't be
 * triggered to spam customers.
 *
 * Exactly-once: each order is atomically claimed via abandoned_email_sent_at
 * before sending, so overlapping runs never double-email.
 */
import { NextResponse, type NextRequest } from "next/server";
import { and, eq, gte, lte, isNull } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { sendAbandonedCartEmail } from "@/lib/email";
import { unsubscribeUrl } from "@/lib/unsubscribe";

export const runtime = "nodejs";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

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
    limit: 100,
  });

  let sent = 0;
  let skipped = 0;

  for (const order of candidates) {
    // Resolve a resume URL + recipient from the live Stripe session.
    let resumeUrl = `${SITE_URL}/cart`;
    let email = order.email?.trim() || "";

    if (order.stripeSessionId && isStripeConfigured()) {
      try {
        const sess = await getStripe().checkout.sessions.retrieve(
          order.stripeSessionId,
        );
        // Already paid/expired → nothing to recover; mark claimed and move on.
        if (sess.status === "complete" || sess.payment_status === "paid") {
          await claim(order.id);
          skipped++;
          continue;
        }
        if (sess.url && sess.status === "open") resumeUrl = sess.url;
        email = email || sess.customer_details?.email || "";
      } catch {
        // Session lookup failed — fall back to the cart link.
      }
    }

    if (!email) {
      skipped++;
      continue; // No way to reach this shopper; leave it for a future run.
    }

    // Atomically claim before sending so concurrent runs can't double-email.
    const claimed = await claim(order.id);
    if (!claimed) {
      skipped++;
      continue;
    }

    const ok = await sendAbandonedCartEmail({
      to: email,
      items: order.items.map((it) => ({
        title: it.productTitle,
        quantity: it.quantity,
      })),
      resumeUrl,
      unsubscribeUrl: unsubscribeUrl(email),
    });
    if (ok) sent++;
    else skipped++;
  }

  return NextResponse.json({ ok: true, scanned: candidates.length, sent, skipped });
}

/** Atomically mark the reminder as sent. Returns true if this call won the claim. */
async function claim(orderId: number): Promise<boolean> {
  const rows = await db
    .update(orders)
    .set({ abandonedEmailSentAt: new Date() })
    .where(and(eq(orders.id, orderId), isNull(orders.abandonedEmailSentAt)))
    .returning({ id: orders.id });
  return rows.length > 0;
}

/**
 * GET /api/cron/review-requests — post-purchase review solicitation (Vercel Cron).
 *
 * Finds orders that shipped a week or more ago and haven't yet been asked for a
 * review, then emails the customer a one-tap link to review their main item.
 * More reviews → stronger social proof on the PDP and richer aggregateRating
 * star snippets in Google results (more click-through on existing rankings).
 *
 * Window: shipped 7–45 days ago (enough time to receive + use the product, but
 * recent enough to still feel relevant). Exactly-once via
 * orders.review_request_email_sent_at, claimed atomically before sending.
 *
 * Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { and, eq, gte, lte, isNull, inArray } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { emailSubscribers, orders } from "@/lib/db/schema";
import { sendReviewRequestEmail } from "@/lib/email";
import { marketingMailReadiness } from "@/lib/marketing/compliance";
import { isMarketingSendable } from "@/lib/marketing/audience";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { absoluteUrl } from "@/lib/seo";

export const runtime = "nodejs";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no-db" });
  }
  // Settle the commercial-mail prerequisites before claiming any row, so a
  // misconfigured sender cannot burn a shopper's single review request.
  const readiness = marketingMailReadiness();
  if (!readiness.ready) {
    console.error(
      `[cron:review-requests] withheld; unmet prerequisites: ${readiness.missing.join(", ")}.`,
    );
    return NextResponse.json({
      ok: true,
      sent: 0,
      reason: "marketing-not-ready",
      missing: readiness.missing,
    });
  }

  const now = Date.now();
  const windowStart = new Date(now - 45 * 24 * 60 * 60 * 1000); // 45 days ago
  const windowEnd = new Date(now - 7 * 24 * 60 * 60 * 1000); // 7 days ago

  const candidates = await db.query.orders.findMany({
    where: and(
      inArray(orders.status, ["shipped", "delivered"]),
      isNull(orders.reviewRequestEmailSentAt),
      gte(orders.shippedAt, windowStart),
      lte(orders.shippedAt, windowEnd),
    ),
    with: {
      items: { columns: { productSlug: true, productTitle: true }, limit: 1 },
    },
    limit: 100,
  });

  let sent = 0;
  let skipped = 0;
  let suppressed = 0;

  for (const order of candidates) {
    const email = order.email?.trim();
    const item = order.items[0];
    if (!email || !item) {
      skipped++;
      continue;
    }
    const normalizedEmail = email.toLowerCase();
    const [subscriber] = await db
      .select({
        status: emailSubscribers.status,
      })
      .from(emailSubscribers)
      .where(eq(emailSubscribers.email, normalizedEmail))
      .limit(1);
    if (!isMarketingSendable(subscriber)) {
      await claim(order.id);
      suppressed++;
      continue;
    }

    const claimed = await claim(order.id);
    if (!claimed) {
      skipped++;
      continue;
    }

    const ok = await sendReviewRequestEmail({
      to: normalizedEmail,
      name: order.shippingAddress?.name,
      productTitle: item.productTitle,
      reviewUrl: absoluteUrl(`/products/${item.productSlug}#reviews`),
      unsubscribeUrl: unsubscribeUrl(normalizedEmail),
      idempotencyKey: `review-request-order-${order.id}-v1`,
    });
    if (ok) sent++;
    else {
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

/** Atomically mark the request as sent. Returns true if this call won the claim. */
async function claim(orderId: number): Promise<boolean> {
  const rows = await db
    .update(orders)
    .set({ reviewRequestEmailSentAt: new Date() })
    .where(
      and(
        eq(orders.id, orderId),
        inArray(orders.status, ["shipped", "delivered"]),
        isNull(orders.reviewRequestEmailSentAt),
      ),
    )
    .returning({ id: orders.id });
  return rows.length > 0;
}

async function releaseClaim(orderId: number): Promise<void> {
  await db
    .update(orders)
    .set({ reviewRequestEmailSentAt: null })
    .where(
      and(eq(orders.id, orderId), inArray(orders.status, ["shipped", "delivered"])),
    );
}

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
import { orders } from "@/lib/db/schema";
import { sendReviewRequestEmail } from "@/lib/email";
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

  for (const order of candidates) {
    const email = order.email?.trim();
    const item = order.items[0];
    if (!email || !item) {
      skipped++;
      continue;
    }

    const claimed = await claim(order.id);
    if (!claimed) {
      skipped++;
      continue;
    }

    const ok = await sendReviewRequestEmail({
      to: email,
      name: order.shippingAddress?.name,
      productTitle: item.productTitle,
      reviewUrl: absoluteUrl(`/products/${item.productSlug}#reviews`),
      unsubscribeUrl: unsubscribeUrl(email),
    });
    if (ok) sent++;
    else skipped++;
  }

  return NextResponse.json({ ok: true, scanned: candidates.length, sent, skipped });
}

/** Atomically mark the request as sent. Returns true if this call won the claim. */
async function claim(orderId: number): Promise<boolean> {
  const rows = await db
    .update(orders)
    .set({ reviewRequestEmailSentAt: new Date() })
    .where(
      and(eq(orders.id, orderId), isNull(orders.reviewRequestEmailSentAt)),
    )
    .returning({ id: orders.id });
  return rows.length > 0;
}

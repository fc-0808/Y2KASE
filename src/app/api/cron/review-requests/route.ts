/**
 * GET /api/cron/review-requests — post-purchase review solicitation (Vercel Cron).
 *
 * Asks after the destination's published delivery window, plus three days to
 * use the case, and never after 45 days. One email covers every product in
 * the order. A signed link verifies the purchase without an account. One
 * reminder follows 10 days later if something is still unreviewed.
 *
 * Exactly-once via orders.review_request_email_sent_at and
 * orders.review_request_reminder_sent_at, claimed atomically before sending.
 *
 * Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { and, eq, gte, lte, isNull, isNotNull, inArray } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { emailSubscribers, orders, reviews } from "@/lib/db/schema";
import { sendReviewRequestEmail } from "@/lib/email";
import type { ReviewRequestMailItem } from "@/emails/ReviewRequestEmail";
import { marketingMailReadiness } from "@/lib/marketing/compliance";
import { isMarketingSendable } from "@/lib/marketing/audience";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { absoluteUrl } from "@/lib/seo";
import {
  CLUB_SMART_SENDING_HOURS,
  subscriberInSmartSendingHoldout,
} from "@/lib/marketing/cadence";
import { latestMarketingSendByEmail } from "@/lib/marketing/send-log";
import { signReviewInvite } from "@/lib/reviews/invite";
import {
  EARLIEST_REVIEW_REQUEST_DAYS,
  REVIEW_REMINDER_AFTER_DAYS,
  REVIEW_REQUEST_MAX_AGE_DAYS,
  isReviewReminderDue,
  isReviewRequestDue,
} from "@/lib/reviews/schedule";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type Wave = "first" | "reminder";

type AskItem = {
  productId: number | null;
  productSlug: string;
  productTitle: string;
  imageUrl: string | null;
};

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no-db" });
  }
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
  const [firstWave, reminderWave] = await Promise.all([
    loadFirstWave(now),
    loadReminderWave(now),
  ]);

  let sent = 0;
  let reminders = 0;
  let skipped = 0;
  let suppressed = 0;

  for (const order of firstWave) {
    const result = await deliver(order, "first", now);
    if (result === "sent") sent++;
    else if (result === "suppressed") suppressed++;
    else skipped++;
  }
  for (const order of reminderWave) {
    const result = await deliver(order, "reminder", now);
    if (result === "sent") {
      sent++;
      reminders++;
    } else if (result === "suppressed") suppressed++;
    else skipped++;
  }

  return NextResponse.json({
    ok: true,
    scanned: firstWave.length + reminderWave.length,
    sent,
    reminders,
    skipped,
    suppressed,
  });
}

async function loadFirstWave(now: number) {
  const oldest = new Date(now - REVIEW_REQUEST_MAX_AGE_DAYS * DAY_MS);
  const earliest = new Date(now - EARLIEST_REVIEW_REQUEST_DAYS * DAY_MS);
  return db.query.orders.findMany({
    where: and(
      eq(orders.adminHidden, false),
      inArray(orders.status, ["shipped", "delivered"]),
      isNull(orders.reviewRequestEmailSentAt),
      gte(orders.shippedAt, oldest),
      lte(orders.shippedAt, earliest),
    ),
    with: {
      items: {
        columns: {
          productId: true,
          productSlug: true,
          productTitle: true,
          imageUrl: true,
        },
      },
    },
    limit: 100,
  });
}

async function loadReminderWave(now: number) {
  const oldest = new Date(now - REVIEW_REQUEST_MAX_AGE_DAYS * DAY_MS);
  const sentBefore = new Date(now - REVIEW_REMINDER_AFTER_DAYS * DAY_MS);
  return db.query.orders.findMany({
    where: and(
      eq(orders.adminHidden, false),
      inArray(orders.status, ["shipped", "delivered"]),
      isNotNull(orders.reviewRequestEmailSentAt),
      lte(orders.reviewRequestEmailSentAt, sentBefore),
      isNull(orders.reviewRequestReminderSentAt),
      gte(orders.shippedAt, oldest),
    ),
    with: {
      items: {
        columns: {
          productId: true,
          productSlug: true,
          productTitle: true,
          imageUrl: true,
        },
      },
    },
    limit: 100,
  });
}

type ReviewOrder = Awaited<ReturnType<typeof loadFirstWave>>[number];

async function deliver(
  order: ReviewOrder,
  wave: Wave,
  now: number,
): Promise<"sent" | "skipped" | "suppressed" | "empty"> {
  if (!order.shippedAt) return "skipped";
  const country = order.shippingAddress?.country || order.geoCountry;
  const nowDate = new Date(now);
  if (wave === "first" && !isReviewRequestDue(order.shippedAt, country, nowDate)) {
    return "skipped";
  }
  if (
    wave === "reminder" &&
    (!order.reviewRequestEmailSentAt ||
      !isReviewReminderDue(order.reviewRequestEmailSentAt, order.shippedAt, nowDate))
  ) {
    return "skipped";
  }

  const email = order.email?.trim();
  if (!email) return "skipped";
  const normalizedEmail = email.toLowerCase();

  const [subscriber] = await db
    .select({ status: emailSubscribers.status })
    .from(emailSubscribers)
    .where(eq(emailSubscribers.email, normalizedEmail))
    .limit(1);
  if (!isMarketingSendable(subscriber)) {
    await claim(order.id, wave);
    return "suppressed";
  }

  const quietSince = new Date(now - CLUB_SMART_SENDING_HOURS * 3_600_000);
  const latest = await latestMarketingSendByEmail([normalizedEmail], quietSince);
  if (
    subscriberInSmartSendingHoldout(latest.get(normalizedEmail) ?? null, nowDate)
  ) {
    return "skipped";
  }

  const productIds = order.items
    .map((item) => item.productId)
    .filter((id): id is number => id != null);
  const reviewed = await reviewedProductIds(order.id, productIds);
  const pending = distinctUnreviewed(order.items, reviewed);
  if (pending.length === 0) {
    await claim(order.id, wave);
    return "empty";
  }

  const claimed = await claim(order.id, wave);
  if (!claimed) return "skipped";

  const ok = await sendReviewRequestEmail({
    to: normalizedEmail,
    name: order.shippingAddress?.name,
    items: pending.map((item) => mailItem(order.id, item)),
    reminder: wave === "reminder",
    unsubscribeUrl: unsubscribeUrl(normalizedEmail),
    idempotencyKey:
      wave === "first"
        ? `review-request-order-${order.id}-v1`
        : `review-request-order-${order.id}-reminder-v1`,
  });
  if (!ok) {
    await release(order.id, wave);
    return "skipped";
  }
  return "sent";
}

function distinctUnreviewed(items: AskItem[], reviewed: Set<number>): AskItem[] {
  const seen = new Set<number>();
  const out: AskItem[] = [];
  for (const item of items) {
    if (item.productId == null || !item.productSlug) continue;
    if (seen.has(item.productId) || reviewed.has(item.productId)) continue;
    seen.add(item.productId);
    out.push(item);
  }
  return out;
}

function mailItem(orderId: number, item: AskItem): ReviewRequestMailItem {
  if (item.productId == null) {
    throw new Error("Review mail item is missing a product.");
  }
  const token = signReviewInvite(orderId, item.productId);
  const reviewUrl = absoluteUrl(
    `/products/${item.productSlug}?review=${encodeURIComponent(token)}#write-review`,
  );
  const starUrls = [1, 2, 3, 4, 5].map((stars) =>
    absoluteUrl(
      `/products/${item.productSlug}?review=${encodeURIComponent(token)}&stars=${stars}#write-review`,
    ),
  ) as ReviewRequestMailItem["starUrls"];
  return {
    title: item.productTitle,
    imageUrl: /^https?:\/\//i.test(item.imageUrl ?? "") ? item.imageUrl : null,
    reviewUrl,
    starUrls,
  };
}

async function reviewedProductIds(
  orderId: number,
  productIds: number[],
): Promise<Set<number>> {
  if (productIds.length === 0) return new Set();
  const rows = await db
    .select({ productId: reviews.productId })
    .from(reviews)
    .where(
      and(
        eq(reviews.orderId, orderId),
        inArray(reviews.productId, productIds),
        inArray(reviews.status, ["pending", "published"]),
      ),
    );
  return new Set(rows.map((row) => row.productId));
}

async function claim(orderId: number, wave: Wave): Promise<boolean> {
  if (wave === "first") {
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
  const rows = await db
    .update(orders)
    .set({ reviewRequestReminderSentAt: new Date() })
    .where(
      and(
        eq(orders.id, orderId),
        isNotNull(orders.reviewRequestEmailSentAt),
        isNull(orders.reviewRequestReminderSentAt),
      ),
    )
    .returning({ id: orders.id });
  return rows.length > 0;
}

async function release(orderId: number, wave: Wave): Promise<void> {
  if (wave === "first") {
    await db
      .update(orders)
      .set({ reviewRequestEmailSentAt: null })
      .where(
        and(
          eq(orders.id, orderId),
          inArray(orders.status, ["shipped", "delivered"]),
        ),
      );
    return;
  }
  await db
    .update(orders)
    .set({ reviewRequestReminderSentAt: null })
    .where(eq(orders.id, orderId));
}

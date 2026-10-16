/**
 * Loads the Today desk. Counts and this week's Club sends only — not the
 * subscriber holdout scan, and not the mailbox. Inbox unread is fetched
 * when the desk is actually open.
 */
import "server-only";

import { cache } from "react";
import { and, count, eq, gte } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { orders, reviews, socialCreatives } from "@/lib/db/schema";
import {
  buildTodayDesk,
  unavailableTodayDesk,
  type TodayDeskSnapshot,
} from "@/lib/admin/today-desk";
import { clubWeekBounds } from "@/lib/marketing/cadence";
import { getCadenceBroadcastsSince } from "@/lib/marketing/cadence-audience";
import { instagramPostsPerDay } from "@/lib/social/instagram-strategy";

function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function asCount(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export const getTodayDesk = cache(async (): Promise<TodayDeskSnapshot> => {
  const now = new Date();
  if (!isDbConfigured()) return unavailableTodayDesk(now);

  try {
    const week = clubWeekBounds(now);
    const since = startOfUtcDay(now);
    const [paid, pending, broadcasts, instagram] = await Promise.allSettled([
      db
        .select({ n: count() })
        .from(orders)
        .where(eq(orders.status, "paid")),
      db
        .select({ n: count() })
        .from(reviews)
        .where(eq(reviews.status, "pending")),
      getCadenceBroadcastsSince(week.start),
      db
        .select({ n: count() })
        .from(socialCreatives)
        .where(
          and(
            eq(socialCreatives.platform, "instagram"),
            eq(socialCreatives.status, "published"),
            gte(socialCreatives.publishedAt, since),
          ),
        ),
    ]);

    if (
      paid.status === "rejected" &&
      pending.status === "rejected" &&
      broadcasts.status === "rejected" &&
      instagram.status === "rejected"
    ) {
      console.error("[today-desk]", paid.reason);
      return unavailableTodayDesk(now);
    }

    if (paid.status === "rejected") console.error("[today-desk] orders", paid.reason);
    if (pending.status === "rejected") {
      console.error("[today-desk] reviews", pending.reason);
    }
    if (broadcasts.status === "rejected") {
      console.error("[today-desk] cadence", broadcasts.reason);
    }
    if (instagram.status === "rejected") {
      console.error("[today-desk] instagram", instagram.reason);
    }

    return buildTodayDesk({
      now,
      paidOrders: paid.status === "fulfilled" ? asCount(paid.value[0]?.n) : 0,
      pendingReviews:
        pending.status === "fulfilled" ? asCount(pending.value[0]?.n) : 0,
      broadcasts: broadcasts.status === "fulfilled" ? broadcasts.value : [],
      igPostedToday:
        instagram.status === "fulfilled" ? asCount(instagram.value[0]?.n) : null,
      igPostsPerDay: instagramPostsPerDay(),
      clubKnown: broadcasts.status === "fulfilled",
    });
  } catch (error) {
    console.error("[today-desk]", error);
    return unavailableTodayDesk(now);
  }
});

/**
 * Social Studio — data access for social_creatives.
 *
 * Thin, typed CRUD over the social_creatives table. The moderation lifecycle is
 * draft → approved → published / rejected; all transitions go through
 * setCreativeStatus so callers can't write arbitrary states.
 */

import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { socialCreatives } from "@/lib/db/schema";

export const CREATIVE_STATUSES = [
  "draft",
  "approved",
  "scheduled",
  "published",
  "rejected",
] as const;
export type CreativeStatus = (typeof CREATIVE_STATUSES)[number];

export type SocialCreative = {
  id: number;
  productId: number | null;
  productTitle: string | null;
  productSlug: string | null;
  sourceImageId: number | null;
  preset: string;
  platform: string;
  mediaType: string;
  videoUrl: string | null;
  imageUrl: string;
  prompt: string;
  title: string | null;
  caption: string | null;
  hashtags: string[];
  status: string;
  model: string | null;
  costCents: number | null;
  scheduledAt: Date | null;
  boardId: string | null;
  externalId: string | null;
  externalUrl: string | null;
  lastError: string | null;
  attempts: number;
  metricImpressions: number | null;
  metricSaves: number | null;
  metricPinClicks: number | null;
  metricOutboundClicks: number | null;
  metricsUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
};

export type NewCreative = {
  productId: number | null;
  productTitle: string | null;
  productSlug?: string | null;
  sourceImageId?: number | null;
  preset: string;
  platform: string;
  mediaType?: string;
  videoUrl?: string | null;
  imageUrl: string;
  prompt: string;
  caption?: string | null;
  hashtags?: string[];
  model?: string | null;
  costCents?: number | null;
};

export async function insertCreative(input: NewCreative): Promise<number> {
  const [row] = await db
    .insert(socialCreatives)
    .values({
      productId: input.productId,
      productTitle: input.productTitle,
      productSlug: input.productSlug ?? null,
      sourceImageId: input.sourceImageId ?? null,
      preset: input.preset,
      platform: input.platform,
      mediaType: input.mediaType ?? "image",
      videoUrl: input.videoUrl ?? null,
      imageUrl: input.imageUrl,
      prompt: input.prompt,
      caption: input.caption ?? null,
      hashtags: input.hashtags ?? [],
      model: input.model ?? null,
      costCents: input.costCents ?? null,
      status: "draft",
    })
    .returning({ id: socialCreatives.id });
  return row.id;
}

export async function getCreatives(
  status?: string,
): Promise<SocialCreative[]> {
  if (!isDbConfigured()) return [];
  const rows = await db
    .select()
    .from(socialCreatives)
    .where(status ? eq(socialCreatives.status, status) : undefined)
    .orderBy(desc(socialCreatives.createdAt))
    .limit(200);
  return rows as SocialCreative[];
}

export async function getCreativeById(
  id: number,
): Promise<SocialCreative | null> {
  if (!isDbConfigured()) return null;
  const [row] = await db
    .select()
    .from(socialCreatives)
    .where(eq(socialCreatives.id, id))
    .limit(1);
  return (row as SocialCreative) ?? null;
}

export async function setCreativeStatus(
  id: number,
  status: CreativeStatus,
): Promise<void> {
  await db
    .update(socialCreatives)
    .set({
      status,
      updatedAt: new Date(),
      ...(status === "published" ? { publishedAt: new Date() } : {}),
    })
    .where(eq(socialCreatives.id, id));
}

export async function updateCreativeCopy(
  id: number,
  caption: string,
  hashtags: string[],
): Promise<void> {
  await db
    .update(socialCreatives)
    .set({ caption, hashtags, updatedAt: new Date() })
    .where(eq(socialCreatives.id, id));
}

/**
 * Set a creative's full SEO content — per-pin title + caption + hashtags. Used
 * by the auto-pin drip to give each pin of a listing a distinct, keyword-varied
 * title/description (empty title clears it → publish falls back to the product
 * title).
 */
export async function updateCreativeContent(
  id: number,
  content: { title?: string | null; caption: string; hashtags: string[] },
): Promise<void> {
  await db
    .update(socialCreatives)
    .set({
      title: content.title?.trim() ? content.title.trim() : null,
      caption: content.caption,
      hashtags: content.hashtags,
      updatedAt: new Date(),
    })
    .where(eq(socialCreatives.id, id));
}

export async function deleteCreative(id: number): Promise<string | null> {
  // Return the imageUrl so the caller can clean up the R2 object.
  const [row] = await db
    .delete(socialCreatives)
    .where(eq(socialCreatives.id, id))
    .returning({ imageUrl: socialCreatives.imageUrl });
  return row?.imageUrl ?? null;
}

export type CreativeStatusCounts = {
  draft: number;
  approved: number;
  scheduled: number;
  published: number;
  rejected: number;
  totalCostCents: number;
};

export async function getCreativeStatusCounts(): Promise<CreativeStatusCounts> {
  if (!isDbConfigured()) {
    return {
      draft: 0,
      approved: 0,
      scheduled: 0,
      published: 0,
      rejected: 0,
      totalCostCents: 0,
    };
  }
  const rows = await db
    .select({
      status: socialCreatives.status,
      count: sql<number>`count(*)::int`,
      cost: sql<number>`coalesce(sum(${socialCreatives.costCents}), 0)::int`,
    })
    .from(socialCreatives)
    .groupBy(socialCreatives.status);

  const out: CreativeStatusCounts = {
    draft: 0,
    approved: 0,
    scheduled: 0,
    published: 0,
    rejected: 0,
    totalCostCents: 0,
  };
  for (const r of rows) {
    if (r.status in out) {
      out[r.status as keyof Omit<CreativeStatusCounts, "totalCostCents">] =
        r.count;
    }
    out.totalCostCents += r.cost;
  }
  return out;
}

/** Count creatives generated since a given time — used for daily budget caps. */
export async function countCreativesSince(since: Date): Promise<number> {
  if (!isDbConfigured()) return 0;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(socialCreatives)
    .where(and(sql`${socialCreatives.createdAt} >= ${since.toISOString()}`));
  return row?.count ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLISHING (P3 — Pinterest)
// ─────────────────────────────────────────────────────────────────────────────

/** Schedule a creative for automated publishing at a future time. */
export async function scheduleCreative(
  id: number,
  when: Date,
  boardId: string,
): Promise<void> {
  await db
    .update(socialCreatives)
    .set({
      status: "scheduled",
      scheduledAt: when,
      boardId,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(socialCreatives.id, id));
}

/**
 * Atomically claim a scheduled creative for publishing. Flips it to "published"
 * up front so a concurrent cron invocation can't double-post; the caller then
 * fills in the external id/url (or rolls back to "scheduled" with lastError on
 * failure). Returns true if this caller won the claim.
 */
export async function claimForPublish(id: number): Promise<boolean> {
  const rows = await db
    .update(socialCreatives)
    .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(socialCreatives.id, id), eq(socialCreatives.status, "scheduled")))
    .returning({ id: socialCreatives.id });
  return rows.length > 0;
}

/** Record a successful publish (external id + url). */
export async function markPublished(
  id: number,
  externalId: string,
  externalUrl: string,
): Promise<void> {
  await db
    .update(socialCreatives)
    .set({
      status: "published",
      externalId,
      externalUrl,
      lastError: null,
      publishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(socialCreatives.id, id));
}

/** Record a failed publish; revert to scheduled so it can be retried. */
export async function markPublishFailed(
  id: number,
  error: string,
  revertToScheduled: boolean,
): Promise<void> {
  await db
    .update(socialCreatives)
    .set({
      status: revertToScheduled ? "scheduled" : "approved",
      lastError: error.slice(0, 500),
      publishedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(socialCreatives.id, id));
}

/** Scheduled creatives whose time has come (for the publish cron). */
export async function getDueScheduled(
  now: Date,
  limit = 25,
): Promise<SocialCreative[]> {
  if (!isDbConfigured()) return [];
  const rows = await db
    .select()
    .from(socialCreatives)
    .where(
      and(
        eq(socialCreatives.status, "scheduled"),
        lte(socialCreatives.scheduledAt, now),
      ),
    )
    .orderBy(asc(socialCreatives.scheduledAt))
    .limit(limit);
  return rows as SocialCreative[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

/** Published creatives that have an external pin id (for analytics refresh). */
export async function getPublishedWithExternalId(
  limit = 200,
): Promise<SocialCreative[]> {
  if (!isDbConfigured()) return [];
  const rows = await db
    .select()
    .from(socialCreatives)
    .where(
      and(
        eq(socialCreatives.status, "published"),
        sql`${socialCreatives.externalId} is not null`,
      ),
    )
    .orderBy(desc(socialCreatives.publishedAt))
    .limit(limit);
  return rows as SocialCreative[];
}

export async function updateCreativeMetrics(
  id: number,
  metrics: {
    impressions: number;
    saves: number;
    pinClicks: number;
    outboundClicks: number;
  },
): Promise<void> {
  await db
    .update(socialCreatives)
    .set({
      metricImpressions: metrics.impressions,
      metricSaves: metrics.saves,
      metricPinClicks: metrics.pinClicks,
      metricOutboundClicks: metrics.outboundClicks,
      metricsUpdatedAt: new Date(),
    })
    .where(eq(socialCreatives.id, id));
}

export type MetricsTotals = {
  impressions: number;
  saves: number;
  pinClicks: number;
  outboundClicks: number;
  trackedPins: number;
};

/** Aggregate published-pin metrics for the studio's performance summary. */
export async function getMetricsTotals(): Promise<MetricsTotals> {
  if (!isDbConfigured()) {
    return { impressions: 0, saves: 0, pinClicks: 0, outboundClicks: 0, trackedPins: 0 };
  }
  const [row] = await db
    .select({
      impressions: sql<number>`coalesce(sum(${socialCreatives.metricImpressions}), 0)::int`,
      saves: sql<number>`coalesce(sum(${socialCreatives.metricSaves}), 0)::int`,
      pinClicks: sql<number>`coalesce(sum(${socialCreatives.metricPinClicks}), 0)::int`,
      outboundClicks: sql<number>`coalesce(sum(${socialCreatives.metricOutboundClicks}), 0)::int`,
      trackedPins: sql<number>`count(${socialCreatives.metricsUpdatedAt})::int`,
    })
    .from(socialCreatives);
  return (
    row ?? {
      impressions: 0,
      saves: 0,
      pinClicks: 0,
      outboundClicks: 0,
      trackedPins: 0,
    }
  );
}

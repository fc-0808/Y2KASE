/**
 * Social Studio — data access for social_creatives.
 *
 * Thin, typed CRUD over the social_creatives table. The moderation lifecycle is
 * draft → approved → published / rejected; all transitions go through
 * setCreativeStatus so callers can't write arbitrary states.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { socialCreatives } from "@/lib/db/schema";

export const CREATIVE_STATUSES = [
  "draft",
  "approved",
  "published",
  "rejected",
] as const;
export type CreativeStatus = (typeof CREATIVE_STATUSES)[number];

export type SocialCreative = {
  id: number;
  productId: number | null;
  productTitle: string | null;
  preset: string;
  platform: string;
  imageUrl: string;
  prompt: string;
  caption: string | null;
  hashtags: string[];
  status: string;
  model: string | null;
  costCents: number | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
};

export type NewCreative = {
  productId: number | null;
  productTitle: string | null;
  preset: string;
  platform: string;
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
      preset: input.preset,
      platform: input.platform,
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
  published: number;
  rejected: number;
  totalCostCents: number;
};

export async function getCreativeStatusCounts(): Promise<CreativeStatusCounts> {
  if (!isDbConfigured()) {
    return { draft: 0, approved: 0, published: 0, rejected: 0, totalCostCents: 0 };
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

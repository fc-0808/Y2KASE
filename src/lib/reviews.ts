/**
 * Reviews data layer — storefront + admin.
 *
 * Star ratings are one of the highest-leverage assets a DTC store has: they lift
 * on-site conversion (social proof) and, via the Product aggregateRating, the
 * star snippets Google renders in search results — which lift click-through on
 * rankings the store already holds. Only PUBLISHED reviews count toward anything
 * customer- or crawler-facing.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { CACHE_TAGS, cachedCatalogRead } from "@/lib/cache";
import { reviews, orders, orderItems, productImages, products } from "@/lib/db/schema";
import type { Review } from "@/lib/db/schema";
import {
  pickLeadQuote,
  pickQuoteBand,
  reviewAuthorLabel,
  type StorefrontQuote,
} from "@/lib/reviews/display";
import { verifyReviewInvite } from "@/lib/reviews/invite";

export const REVIEW_STATUSES = ["pending", "published", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export type ReviewSummary = {
  /** Number of published reviews. */
  count: number;
  /** Mean rating to one decimal (0 when no reviews). */
  average: number;
  /** Count of published reviews per star value (1–5). */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
};

const EMPTY_SUMMARY: ReviewSummary = {
  count: 0,
  average: 0,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

/** Aggregate published-review stats for a single product. */
export function getReviewSummary(productId: number): Promise<ReviewSummary> {
  if (!isDbConfigured()) return Promise.resolve(EMPTY_SUMMARY);
  return getReviewSummaryCached(productId);
}

const getReviewSummaryCached = cachedCatalogRead(
  computeReviewSummary,
  ["published-review-summary-v1"],
  { tags: [CACHE_TAGS.reviews] },
);

async function computeReviewSummary(productId: number): Promise<ReviewSummary> {
  try {
    const rows = await db
      .select({ rating: reviews.rating, n: sql<number>`count(*)::int` })
      .from(reviews)
      .where(
        and(eq(reviews.productId, productId), eq(reviews.status, "published")),
      )
      .groupBy(reviews.rating);

    return summarize(rows);
  } catch {
    return EMPTY_SUMMARY;
  }
}

/** Published reviews for a product, newest first. */
export function getPublishedReviews(
  productId: number,
  limit = 50,
): Promise<Review[]> {
  if (!isDbConfigured()) return Promise.resolve([]);
  const boundedLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
  return getPublishedReviewsCached(productId, boundedLimit);
}

const getPublishedReviewsCached = cachedCatalogRead(
  computePublishedReviews,
  ["published-product-reviews-v2"],
  { tags: [CACHE_TAGS.reviews] },
);

async function computePublishedReviews(
  productId: number,
  limit: number,
): Promise<Review[]> {
  try {
    return await db.query.reviews.findMany({
      where: and(
        eq(reviews.productId, productId),
        eq(reviews.status, "published"),
      ),
      orderBy: [desc(reviews.verified), desc(reviews.createdAt)],
      limit,
    });
  } catch {
    return [];
  }
}

/** Batch summaries for a set of products (for listing-card stars). */
export async function getReviewSummaries(
  productIds: number[],
): Promise<Map<number, { count: number; average: number }>> {
  const out = new Map<number, { count: number; average: number }>();
  if (!isDbConfigured() || productIds.length === 0) return out;
  try {
    const rows = await db
      .select({
        productId: reviews.productId,
        avg: sql<number>`avg(${reviews.rating})::float`,
        n: sql<number>`count(*)::int`,
      })
      .from(reviews)
      .where(
        and(
          inArray(reviews.productId, productIds),
          eq(reviews.status, "published"),
        ),
      )
      .groupBy(reviews.productId);

    for (const r of rows) {
      out.set(r.productId, {
        count: r.n,
        average: Math.round((r.avg ?? 0) * 10) / 10,
      });
    }
  } catch {
    // fall through to empty
  }
  return out;
}

export type StorefrontProof = {
  lead: StorefrontQuote | null;
  band: StorefrontQuote[];
};

const EMPTY_PROOF: StorefrontProof = { lead: null, band: [] };

/** Homepage line, plus the three-quote band once the file is large enough. */
export function getStorefrontProof(): Promise<StorefrontProof> {
  if (!isDbConfigured()) return Promise.resolve(EMPTY_PROOF);
  return getStorefrontProofCached();
}

const getStorefrontProofCached = cachedCatalogRead(
  computeStorefrontProof,
  ["storefront-review-proof-v2"],
  { tags: [CACHE_TAGS.reviews] },
);

async function computeStorefrontProof(): Promise<StorefrontProof> {
  try {
    const rows = await db
      .select({
        id: reviews.id,
        productId: reviews.productId,
        rating: reviews.rating,
        body: reviews.body,
        authorName: reviews.authorName,
        verified: reviews.verified,
        productTitle: products.title,
        productSlug: products.slug,
        imageUrl: sql<string | null>`(
          SELECT ${productImages.url}
          FROM ${productImages}
          WHERE ${productImages.productId} = ${products.id}
          ORDER BY ${productImages.position} ASC
          LIMIT 1
        )`,
        createdAt: reviews.createdAt,
      })
      .from(reviews)
      .innerJoin(products, eq(products.id, reviews.productId))
      .where(
        and(eq(reviews.status, "published"), eq(products.status, "active")),
      )
      .orderBy(desc(reviews.verified), desc(reviews.createdAt), asc(reviews.id))
      .limit(40);

    const candidates = rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      rating: row.rating,
      body: row.body,
      authorName: row.authorName,
      verified: row.verified,
      productTitle: row.productTitle,
      productSlug: row.productSlug,
      imageUrl: row.imageUrl,
    }));
    const lead = pickLeadQuote(candidates);
    return {
      lead,
      band: pickQuoteBand(candidates, lead?.id),
    };
  } catch (error) {
    console.error("[reviews] storefront proof unavailable:", error);
    return EMPTY_PROOF;
  }
}

export type ReviewInviteState =
  | { status: "none" }
  | { status: "expired" }
  | {
      status: "valid";
      token: string;
      authorName: string;
      initialRating: number;
      alreadyReviewed: boolean;
    };

const REVIEWABLE_ORDER_STATUSES = ["paid", "shipped", "delivered"] as const;

/** What the product page should do with `?review=` from the post-purchase email. */
export async function resolveReviewInvite(input: {
  token?: string;
  productId: number;
  stars?: string;
}): Promise<ReviewInviteState> {
  const token = input.token?.trim() ?? "";
  if (!token || !isDbConfigured()) return { status: "none" };

  const parsed = verifyReviewInvite(token);
  if (!parsed) return { status: "expired" };
  if (parsed.productId !== input.productId) return { status: "none" };

  const order = await matchingReviewOrder(parsed.orderId, parsed.productId);
  if (!order) return { status: "expired" };

  const stars = Number(input.stars);
  const initialRating =
    Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : 0;

  return {
    status: "valid",
    token,
    authorName: reviewAuthorLabel(order.shippingAddress?.name ?? ""),
    initialRating,
    alreadyReviewed: await hasOpenReview(parsed.orderId, parsed.productId),
  };
}

async function matchingReviewOrder(orderId: number, productId: number) {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    columns: { id: true, email: true, status: true, shippingAddress: true },
    with: { items: { columns: { productId: true } } },
  });
  if (!order?.email) return null;
  if (
    !REVIEWABLE_ORDER_STATUSES.includes(
      order.status as (typeof REVIEWABLE_ORDER_STATUSES)[number],
    )
  ) {
    return null;
  }
  if (!order.items.some((item) => item.productId === productId)) return null;
  return order;
}

async function hasOpenReview(orderId: number, productId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(
      and(
        eq(reviews.orderId, orderId),
        eq(reviews.productId, productId),
        inArray(reviews.status, ["pending", "published"]),
      ),
    )
    .limit(1);
  return Boolean(row);
}

function summarize(rows: { rating: number; n: number }[]): ReviewSummary {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<
    1 | 2 | 3 | 4 | 5,
    number
  >;
  let total = 0;
  let weighted = 0;
  for (const r of rows) {
    const star = Math.min(5, Math.max(1, r.rating)) as 1 | 2 | 3 | 4 | 5;
    distribution[star] += r.n;
    total += r.n;
    weighted += star * r.n;
  }
  return {
    count: total,
    average: total > 0 ? Math.round((weighted / total) * 10) / 10 : 0,
    distribution,
  };
}

// ─── Submission ──────────────────────────────────────────────────────────────

export type SubmitReviewInput = {
  productId: number;
  authorName: string;
  authorEmail?: string;
  rating: number;
  title?: string;
  body: string;
  userId?: string | null;
  /** Server-derived session email; never accept this value from the browser. */
  authenticatedEmail?: string;
  /** Signed post-purchase link. Verifies the order without an account. */
  reviewToken?: string;
};

export type SubmitReviewResult =
  | { ok: true; status: ReviewStatus }
  | { ok: false; error: string };

/**
 * Validate + persist a review. A reviewer with a matching paid order for the
 * product is marked verified and auto-published; everyone else is held for
 * moderation so the storefront can't be spammed with fake or abusive content.
 */
export async function submitReview(
  input: SubmitReviewInput,
): Promise<SubmitReviewResult> {
  if (!isDbConfigured()) {
    return { ok: false, error: "Reviews are unavailable right now." };
  }

  const rating = Math.round(Number(input.rating));
  const name = input.authorName?.trim();
  const body = input.body?.trim();
  const title = input.title?.trim() || null;
  const email = input.authorEmail?.trim().toLowerCase() || null;

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Please choose a rating from 1 to 5 stars." };
  }
  if (!name || name.length > 80) {
    return { ok: false, error: "Please enter your name." };
  }
  if (!body || body.length < 4 || body.length > 4000) {
    return { ok: false, error: "Please write a few words about the product." };
  }

  // A signed email link proves the purchase. Otherwise verification requires
  // a signed-in account whose email matches the order — typing an address
  // into the form does not.
  let verified = false;
  let orderId: number | null = null;
  let authorEmail = email;

  const invite = input.reviewToken ? verifyReviewInvite(input.reviewToken) : null;
  if (
    invite &&
    invite.productId === input.productId &&
    (await hasOpenReview(invite.orderId, invite.productId))
  ) {
    return { ok: false, error: "You've already reviewed this case." };
  }
  if (invite && invite.productId === input.productId) {
    const order = await matchingReviewOrder(invite.orderId, invite.productId);
    if (order) {
      verified = true;
      orderId = order.id;
      authorEmail = order.email?.trim().toLowerCase() ?? null;
    }
  }

  const authenticatedEmail =
    input.authenticatedEmail?.trim().toLowerCase() || null;
  if (!verified && email && authenticatedEmail === email) {
    try {
      const match = await db
        .select({ orderId: orders.id })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(
          and(
            eq(orderItems.productId, input.productId),
            eq(orders.email, email),
            inArray(orders.status, ["paid", "shipped", "delivered"]),
          ),
        )
        .limit(1);
      if (match.length > 0) {
        verified = true;
        orderId = match[0].orderId;
      }
    } catch {
      // verification is best-effort; default to unverified/moderated
    }
  }

  const status: ReviewStatus = verified ? "published" : "pending";

  try {
    await db.insert(reviews).values({
      productId: input.productId,
      orderId,
      userId: input.userId ?? null,
      authorName: name.slice(0, 80),
      authorEmail,
      rating,
      title: title?.slice(0, 120) ?? null,
      body: body.slice(0, 4000),
      status,
      verified,
      publishedAt: status === "published" ? new Date() : null,
    });
    return { ok: true, status };
  } catch (err) {
    console.error("[reviews] insert failed:", err);
    return { ok: false, error: "Could not submit your review. Please try again." };
  }
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export type AdminReview = Review & {
  product: { slug: string; title: string } | null;
};

export async function getAdminReviews(status?: string): Promise<AdminReview[]> {
  if (!isDbConfigured()) return [];
  const rows = await db.query.reviews.findMany({
    where: status ? eq(reviews.status, status) : undefined,
    orderBy: desc(reviews.createdAt),
    limit: 500,
    with: { product: { columns: { slug: true, title: true } } },
  });
  return rows as AdminReview[];
}

export async function getReviewStatusCounts(): Promise<
  Record<string, number>
> {
  const out: Record<string, number> = {
    pending: 0,
    published: 0,
    rejected: 0,
  };
  if (!isDbConfigured()) return out;
  try {
    const rows = await db
      .select({ status: reviews.status, n: sql<number>`count(*)::int` })
      .from(reviews)
      .groupBy(reviews.status);
    for (const r of rows) out[r.status] = r.n;
  } catch {
    // empty
  }
  return out;
}

/** Admin: public reply shown under the review. Empty clears it. */
export async function setMerchantReply(
  id: number,
  reply: string | null,
): Promise<void> {
  const text = reply?.trim() || null;
  await db
    .update(reviews)
    .set({
      merchantReply: text ? text.slice(0, 2000) : null,
      merchantRepliedAt: text ? new Date() : null,
    })
    .where(eq(reviews.id, id));
}

/** Admin: set a review's moderation status. Stamps publishedAt on publish. */
export async function setReviewStatus(
  id: number,
  status: ReviewStatus,
): Promise<void> {
  await db
    .update(reviews)
    .set({
      status,
      publishedAt: status === "published" ? new Date() : null,
    })
    .where(eq(reviews.id, id));
}

/** Product the review belongs to, for narrow storefront revalidation. */
export async function getReviewProductRef(
  id: number,
): Promise<{ productId: number; slug: string } | null> {
  if (!isDbConfigured() || !Number.isFinite(id)) return null;
  const [row] = await db
    .select({ productId: reviews.productId, slug: products.slug })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(eq(reviews.id, id))
    .limit(1);
  return row ?? null;
}

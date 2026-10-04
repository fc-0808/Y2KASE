/**
 * Light server-side helpers for the thumbnail-normalization review queue:
 * queue stats and the approve / flag / skip mutations. These touch only the DB
 * and R2, so this module stays free of the heavy Sharp + vision imports (those
 * live in `./thumbnails-generate`, loaded only when proposals are generated).
 *
 * Never import from a client component — this runs Node-only code.
 */
import { and, asc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  products,
  productImages,
  thumbnailProposals,
  NORMALIZED_THUMBNAIL_SOURCE as NORMALIZED_SOURCE,
} from "@/lib/db/schema";
import { makeR2Client, deleteObjectsFromR2, r2KeyFromUrl } from "@/lib/catalog/r2";
import {
  LIVE_PRODUCT_STATUS,
  shouldPublishDraftOnApprove,
} from "@/lib/catalog/product-page";
import { RETRIES_EXHAUSTED_MARK } from "@/lib/catalog/thumbnail-route";
import {
  SCOPE_STATUSES,
  DEFAULT_THUMBNAIL_SCOPE,
  type ThumbnailScope,
} from "./thumbnail-scope";
import type { ThumbnailProposalView } from "./thumbnail-studio";
import {
  coerceThumbnailUrls,
  pushThumbnailUrl,
  stepThumbnailUrl,
} from "./thumbnail-history";

export type ApproveProposalOptions = {
  /**
   * When true, a draft product is published in the same write. Live products
   * are unchanged. Default is thumbnail-only.
   */
  publish?: boolean;
};

/**
 * The `products` predicate for a scope. Every query that feeds the review page
 * — counters, lists and the batch generator — goes through this, so the number
 * on the "Generate all" button always matches the rows underneath it.
 */
export function productScopeFilter(scope: ThumbnailScope): SQL {
  return inArray(products.status, [...SCOPE_STATUSES[scope]]);
}

/**
 * System failures Generate all may spend on again.
 *
 * A human flag keeps the preview URL and is excluded — the operator already
 * decided that result should not be rebuilt automatically. A row whose reason
 * carries the exhausted mark has used its automatic attempts; another pass
 * would re-bill the same failure. Manual Regenerate does not use this filter.
 */
export function autoRetryableProposalFilter(): SQL {
  return sql`${thumbnailProposals.status} = 'flagged'
    and ${thumbnailProposals.proposalUrl} is null
    and position(${RETRIES_EXHAUSTED_MARK} in coalesce(${thumbnailProposals.reason}, '')) = 0`;
}

/**
 * Promote an approved proposal to the live gallery: shift existing images down
 * and insert the normalized image as the new position-0 hero (the original
 * photos are preserved, so this is reversible).
 */
export async function approveProposal(
  productId: number,
  options?: ApproveProposalOptions,
): Promise<{ ok: boolean; message: string; published: boolean }> {
  const prop = await db.query.thumbnailProposals.findFirst({
    where: eq(thumbnailProposals.productId, productId),
  });
  if (!prop) {
    return { ok: false, message: "No proposal for this product.", published: false };
  }
  if (prop.status !== "proposed" || !prop.proposalUrl) {
    return {
      ok: false,
      message: "No pending proposal to approve.",
      published: false,
    };
  }

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { title: true, status: true },
    with: {
      images: {
        columns: { id: true, altText: true, url: true, sourceFilename: true },
      },
    },
  });
  const altText =
    product?.images.find((i) => i.id === prop.sourceImageId)?.altText ??
    product?.title ??
    null;

  // Idempotent re-approval: drop any previously-approved normalized thumbnail
  // (and its R2 object) so a re-approval REPLACES it instead of stacking.
  const priors = (product?.images ?? []).filter(
    (i) => i.sourceFilename === NORMALIZED_SOURCE,
  );
  if (priors.length) {
    await db
      .delete(productImages)
      .where(inArray(productImages.id, priors.map((p) => p.id)));
    const bucket = process.env.R2_BUCKET_NAME;
    if (bucket) {
      const keys = priors
        .map((p) => r2KeyFromUrl(p.url))
        .filter((k): k is string => Boolean(k));
      if (keys.length) {
        try {
          await deleteObjectsFromR2(makeR2Client(), bucket, keys);
        } catch {
          // Best-effort cleanup — a stale object is harmless.
        }
      }
    }
  }

  await db
    .update(productImages)
    .set({ position: sql`${productImages.position} + 1` })
    .where(eq(productImages.productId, productId));

  await db.insert(productImages).values({
    productId,
    url: prop.proposalUrl,
    position: 0,
    altText,
    aiAnalyzed: true,
    styleTags: [],
    sourceFilename: NORMALIZED_SOURCE,
  });

  await db
    .update(thumbnailProposals)
    .set({ status: "approved", updatedAt: new Date() })
    .where(eq(thumbnailProposals.productId, productId));

  const publish =
    product != null &&
    shouldPublishDraftOnApprove(product.status, options?.publish);
  if (publish) {
    await db
      .update(products)
      .set({ status: LIVE_PRODUCT_STATUS, updatedAt: new Date() })
      .where(eq(products.id, productId));
  }

  return {
    ok: true,
    message: publish
      ? "Thumbnail approved and published."
      : "Thumbnail approved.",
    published: publish,
  };
}

/**
 * Record a manual decision on a proposal. "flagged" = needs a better source
 * photo; "skipped" = leave as-is. Skipping discards the generated preview to
 * avoid orphaned R2 objects.
 */
export async function setProposalDecision(
  productId: number,
  decision: "flagged" | "skipped",
): Promise<{ ok: boolean; message: string }> {
  const prop = await db.query.thumbnailProposals.findFirst({
    where: eq(thumbnailProposals.productId, productId),
  });
  if (!prop) return { ok: false, message: "No proposal for this product." };

  if (decision === "skipped") {
    try {
      const images = await db
        .select({ url: productImages.url })
        .from(productImages)
        .where(eq(productImages.productId, productId));
      const live = new Set(images.map((image) => image.url));
      // The approved listing image can sit on the previous stack after a
      // regenerate. Skip must not delete that object.
      const discard = [
        prop.proposalUrl,
        ...coerceThumbnailUrls(prop.previousProposalUrls),
        ...coerceThumbnailUrls(prop.nextProposalUrls),
      ].filter((url): url is string => typeof url === "string" && !live.has(url));
      const bucket = process.env.R2_BUCKET_NAME;
      const keys = discard
        .map((url) => r2KeyFromUrl(url))
        .filter((key): key is string => Boolean(key));
      if (bucket && keys.length) {
        await deleteObjectsFromR2(makeR2Client(), bucket, keys);
      }
    } catch {
      // Best-effort cleanup — a stale preview object is harmless.
    }
  }

  await db
    .update(thumbnailProposals)
    .set({
      status: decision,
      proposalUrl: decision === "skipped" ? null : prop.proposalUrl,
      previousProposalUrls: decision === "skipped" ? [] : prop.previousProposalUrls,
      nextProposalUrls: decision === "skipped" ? [] : prop.nextProposalUrls,
      updatedAt: new Date(),
    })
    .where(eq(thumbnailProposals.productId, productId));

  return {
    ok: true,
    message: decision === "flagged" ? "Flagged for a new photo." : "Skipped.",
  };
}

export type PendingProduct = {
  productId: number;
  slug: string;
  title: string;
  /** `active` | `draft` — drives the Draft badge on the card. */
  productStatus: string;
  currentUrl: string | null;
};

/** In-scope products that don't have a proposal yet (the "not started" queue),
 *  with their current thumbnail — so the review page can list them and let the
 *  admin generate individually. */
export async function getPendingProducts(
  limit = 48,
  scope: ThumbnailScope = DEFAULT_THUMBNAIL_SCOPE,
): Promise<PendingProduct[]> {
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .leftJoin(thumbnailProposals, eq(thumbnailProposals.productId, products.id))
    .where(and(productScopeFilter(scope), isNull(thumbnailProposals.id)))
    .orderBy(asc(products.id))
    .limit(limit);

  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];

  const withImages = await db.query.products.findMany({
    where: inArray(products.id, ids),
    columns: { id: true, slug: true, title: true, status: true },
    with: {
      images: {
        columns: { url: true },
        orderBy: (img, { asc: a }) => a(img.position),
        limit: 1,
      },
    },
  });
  const byId = new Map(withImages.map((p) => [p.id, p]));

  return ids
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      productId: p.id,
      slug: p.slug,
      title: p.title,
      productStatus: p.status,
      currentUrl: p.images[0]?.url ?? null,
    }));
}

/** One row of the To review / Needs attention / Approved lists. */
export type ProposalQueueItem = {
  productId: number;
  slug: string;
  title: string;
  /** `active` | `draft` — an approved thumbnail on a draft isn't live yet. */
  productStatus: string;
  currentUrl: string | null;
  proposalUrl: string | null;
  /** Replaced previews Previous can restore. */
  previousCount: number;
  /** Previews Redo can bring back after Previous. */
  nextCount: number;
  score: number | null;
  category: string | null;
  reason: string | null;
};

/**
 * Hard ceiling for a single status bucket on the review page.
 *
 * The page must list every in-scope row up to this cap so section counts stay
 * honest against `getThumbnailQueueStats`. Below the cap we load the full
 * bucket (no silent truncation). Above it the UI discloses "showing first N".
 * Sized for catalog-scale admin use (hundreds–low thousands), not storefront
 * pagination.
 */
export const THUMBNAIL_QUEUE_LIST_CAP = 500;

/**
 * Read one status bucket of the proposal queue, restricted to products in
 * scope. The scope is applied as a subquery on `products` because Drizzle's
 * relational API can't filter on a joined table — doing it in JS would apply
 * `limit` before the filter and silently drop rows.
 *
 * Omit `limit` (or pass the shared cap) when rendering a section that claims
 * to show the full bucket — never use a low hard-coded limit that disagrees
 * with the header stats.
 */
export async function getProposalQueue({
  status,
  scope,
  limit = THUMBNAIL_QUEUE_LIST_CAP,
  order,
}: {
  status: "proposed" | "flagged" | "approved" | "skipped";
  scope: ThumbnailScope;
  /** Max rows to return. Defaults to {@link THUMBNAIL_QUEUE_LIST_CAP}. */
  limit?: number;
  /** "score" ranks the best candidates first; "recent" is most-recently-touched. */
  order: "score" | "recent";
}): Promise<ProposalQueueItem[]> {
  const safeLimit = Math.max(1, Math.min(limit, THUMBNAIL_QUEUE_LIST_CAP));
  const rows = await db.query.thumbnailProposals.findMany({
    where: and(
      eq(thumbnailProposals.status, status),
      inArray(
        thumbnailProposals.productId,
        db
          .select({ id: products.id })
          .from(products)
          .where(productScopeFilter(scope)),
      ),
    ),
    with: {
      product: {
        columns: { id: true, slug: true, title: true, status: true },
        with: {
          images: {
            columns: { url: true },
            orderBy: (img, { asc: a }) => a(img.position),
            limit: 1,
          },
        },
      },
    },
    orderBy: (t, { desc }) => (order === "score" ? desc(t.score) : desc(t.updatedAt)),
    limit: safeLimit,
  });

  return rows
    .filter((r) => r.product)
    .map((r) => ({
      productId: r.productId,
      slug: r.product!.slug,
      title: r.product!.title,
      productStatus: r.product!.status,
      currentUrl: r.product!.images[0]?.url ?? null,
      proposalUrl: r.proposalUrl,
      previousCount: coerceThumbnailUrls(r.previousProposalUrls).length,
      nextCount: coerceThumbnailUrls(r.nextProposalUrls).length,
      score: r.score != null ? Number(r.score) : null,
      category: r.category,
      reason: r.reason,
    }));
}

/**
 * The proposal row for one product editor. `null` means generation has never
 * run — the editor treats that as "not started". The listing image itself
 * comes from the product already loaded for the page, so this query does not
 * repeat the gallery.
 */
export async function getThumbnailProposalForProduct(
  productId: number,
): Promise<ThumbnailProposalView | null> {
  const row = await db.query.thumbnailProposals.findFirst({
    where: eq(thumbnailProposals.productId, productId),
    columns: {
      status: true,
      proposalUrl: true,
      previousProposalUrls: true,
      nextProposalUrls: true,
      score: true,
      category: true,
      reason: true,
    },
  });
  if (!row) return null;
  const score = row.score == null ? null : Number(row.score);
  return {
    status: row.status,
    proposalUrl: row.proposalUrl,
    previousCount: coerceThumbnailUrls(row.previousProposalUrls).length,
    nextCount: coerceThumbnailUrls(row.nextProposalUrls).length,
    score: score != null && Number.isFinite(score) ? score : null,
    category: row.category,
    reason: row.reason,
  };
}

/** Which review-board section a product belongs in after an action. */
export type ThumbnailReviewBucket =
  | "proposed"
  | "flagged"
  | "approved"
  | "pending"
  | "hidden";

/**
 * One product as the review board should show it right now.
 * The client reads this after Generate / Regenerate / Remove BG / Remove Tag
 * so the new thumbnail can appear without waiting on a full page refresh.
 */
export type ThumbnailReviewCard = {
  productId: number;
  slug: string;
  title: string;
  productStatus: string;
  currentUrl: string | null;
  proposalUrl: string | null;
  previousCount: number;
  nextCount: number;
  score: number | null;
  category: string | null;
  reason: string | null;
  bucket: ThumbnailReviewBucket;
};

function reviewBucket(
  status: string | undefined,
  proposalUrl: string | null,
): ThumbnailReviewBucket {
  if (!status) return "pending";
  if (status === "proposed" && proposalUrl) return "proposed";
  if (status === "flagged") return "flagged";
  if (status === "approved") return "approved";
  return "hidden";
}

/** Latest review-board placement for one product. `null` if the product is gone. */
export async function getThumbnailReviewCard(
  productId: number,
): Promise<ThumbnailReviewCard | null> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { id: true, slug: true, title: true, status: true },
    with: {
      images: {
        columns: { url: true },
        orderBy: (img, { asc: a }) => a(img.position),
        limit: 1,
      },
    },
  });
  if (!product) return null;

  const row = await db.query.thumbnailProposals.findFirst({
    where: eq(thumbnailProposals.productId, productId),
    columns: {
      status: true,
      proposalUrl: true,
      previousProposalUrls: true,
      nextProposalUrls: true,
      score: true,
      category: true,
      reason: true,
    },
  });

  const score = row?.score == null ? null : Number(row.score);
  const proposalUrl = row?.proposalUrl ?? null;
  return {
    productId: product.id,
    slug: product.slug,
    title: product.title,
    productStatus: product.status,
    currentUrl: product.images[0]?.url ?? null,
    proposalUrl,
    previousCount: coerceThumbnailUrls(row?.previousProposalUrls).length,
    nextCount: coerceThumbnailUrls(row?.nextProposalUrls).length,
    score: score != null && Number.isFinite(score) ? score : null,
    category: row?.category ?? null,
    reason: row?.reason ?? null,
    bucket: reviewBucket(row?.status, proposalUrl),
  };
}

/** Approve many proposals in sequence (each is a fast DB/R2 op). Returns how
 *  many actually applied (non-proposed ones are skipped by approveProposal)
 *  and how many drafts were published along with the thumbnail. */
export async function approveProposals(
  ids: number[],
  options?: ApproveProposalOptions,
): Promise<{ processed: number; published: number }> {
  let processed = 0;
  let published = 0;
  for (const id of ids) {
    const res = await approveProposal(id, options);
    if (res.ok) {
      processed++;
      if (res.published) published++;
    }
  }
  return { processed, published };
}

/** Flag or skip many proposals in sequence. */
export async function decideProposals(
  ids: number[],
  decision: "flagged" | "skipped",
): Promise<{ processed: number }> {
  let processed = 0;
  for (const id of ids) {
    const res = await setProposalDecision(id, decision);
    if (res.ok) processed++;
  }
  return { processed };
}

type ProposalPreviewPatch = {
  status: "proposed" | "flagged";
  proposalUrl?: string | null;
  sourceImageId?: number | null;
  score?: number | null;
  category?: string | null;
  reason?: string | null;
};

/**
 * Write a preview and remember the URL it replaced.
 *
 * Generate, regenerate, crop, background removal, and upload all come through
 * here so Previous can restore the last thumbnail. A failed generate that
 * clears the URL still pushes the old one, so the flagged card can undo it.
 */
export async function saveProposalPreview(
  productId: number,
  patch: ProposalPreviewPatch,
): Promise<void> {
  const existing = await db.query.thumbnailProposals.findFirst({
    where: eq(thumbnailProposals.productId, productId),
    columns: {
      proposalUrl: true,
      previousProposalUrls: true,
      nextProposalUrls: true,
    },
  });
  const history = pushThumbnailUrl(
    {
      proposalUrl: existing?.proposalUrl ?? null,
      previousUrls: existing?.previousProposalUrls ?? [],
      nextUrls: existing?.nextProposalUrls ?? [],
    },
    patch.proposalUrl ?? null,
  );
  const row = {
    productId,
    status: patch.status,
    proposalUrl: history.proposalUrl,
    previousProposalUrls: history.previousUrls,
    nextProposalUrls: history.nextUrls,
    sourceImageId: patch.sourceImageId ?? null,
    score: patch.score != null ? String(patch.score) : null,
    category: patch.category ?? null,
    reason: patch.reason ?? null,
    updatedAt: new Date(),
  };
  await db
    .insert(thumbnailProposals)
    .values(row)
    .onConflictDoUpdate({
      target: thumbnailProposals.productId,
      set: {
        status: row.status,
        proposalUrl: row.proposalUrl,
        previousProposalUrls: row.previousProposalUrls,
        nextProposalUrls: row.nextProposalUrls,
        sourceImageId: row.sourceImageId,
        score: row.score,
        category: row.category,
        reason: row.reason,
        updatedAt: row.updatedAt,
      },
    });
}

/**
 * Restore the previous generated thumbnail, or bring back the one Previous
 * just left. Only review and flagged rows move — an approved listing image
 * stays put until a new preview is approved.
 */
export async function stepThumbnailProposal(
  productId: number,
  direction: "previous" | "redo",
): Promise<{ ok: boolean; message: string }> {
  const prop = await db.query.thumbnailProposals.findFirst({
    where: eq(thumbnailProposals.productId, productId),
  });
  if (!prop) return { ok: false, message: "No proposal for this product." };
  if (prop.status !== "proposed" && prop.status !== "flagged") {
    return {
      ok: false,
      message: "Only a thumbnail in review can be restored.",
    };
  }
  const stepped = stepThumbnailUrl(
    {
      proposalUrl: prop.proposalUrl,
      previousUrls: prop.previousProposalUrls ?? [],
      nextUrls: prop.nextProposalUrls ?? [],
    },
    direction,
  );
  if (!stepped?.proposalUrl) {
    return {
      ok: false,
      message:
        direction === "previous"
          ? "No previous thumbnail to restore."
          : "Nothing to redo.",
    };
  }
  await db
    .update(thumbnailProposals)
    .set({
      status: "proposed",
      proposalUrl: stepped.proposalUrl,
      previousProposalUrls: stepped.previousUrls,
      nextProposalUrls: stepped.nextUrls,
      reason:
        direction === "previous"
          ? "Restored the previous generated thumbnail."
          : "Restored the newer generated thumbnail.",
      updatedAt: new Date(),
    })
    .where(eq(thumbnailProposals.productId, productId));
  return {
    ok: true,
    message:
      direction === "previous"
        ? "Restored the previous thumbnail."
        : "Restored the newer thumbnail.",
  };
}

/** Record a manually-uploaded image as a product's proposal (goes to "To
 *  review" so it's approved through the same flow). */
export async function setUploadedProposal(
  productId: number,
  proposalUrl: string,
): Promise<void> {
  await saveProposalPreview(productId, {
    status: "proposed",
    proposalUrl,
    sourceImageId: null,
    score: null,
    category: "manual",
    reason: "Manually uploaded.",
  });
}

export type ThumbnailQueueStats = {
  pending: number;
  proposed: number;
  approved: number;
  flagged: number;
  skipped: number;
  /**
   * Flagged rows Generate all will still attempt. Smaller than `flagged`:
   * human flags and exhausted system failures stay on the board but are not
   * billed again by the batch button.
   */
  retryable: number;
};

/** Queue counters for the review page header and the Products nav badge. */
export async function getThumbnailQueueStats(
  scope: ThumbnailScope = DEFAULT_THUMBNAIL_SCOPE,
): Promise<ThumbnailQueueStats> {
  const [statusRows, pendingRow, retryableRow] = await Promise.all([
    db
      .select({
        status: thumbnailProposals.status,
        count: sql<number>`count(*)::int`,
      })
      .from(thumbnailProposals)
      .innerJoin(products, eq(products.id, thumbnailProposals.productId))
      .where(productScopeFilter(scope))
      .groupBy(thumbnailProposals.status),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .leftJoin(
        thumbnailProposals,
        eq(thumbnailProposals.productId, products.id),
      )
      .where(and(productScopeFilter(scope), isNull(thumbnailProposals.id))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(thumbnailProposals)
      .innerJoin(products, eq(products.id, thumbnailProposals.productId))
      .where(and(productScopeFilter(scope), autoRetryableProposalFilter())),
  ]);

  const by = Object.fromEntries(statusRows.map((r) => [r.status, r.count]));
  return {
    pending: pendingRow[0]?.count ?? 0,
    proposed: by["proposed"] ?? 0,
    approved: by["approved"] ?? 0,
    flagged: by["flagged"] ?? 0,
    skipped: by["skipped"] ?? 0,
    retryable: retryableRow[0]?.count ?? 0,
  };
}

/** How many products each scope covers, for the scope selector's counts. */
export async function getScopeCounts(): Promise<Record<ThumbnailScope, number>> {
  const rows = await db
    .select({ status: products.status, count: sql<number>`count(*)::int` })
    .from(products)
    .where(productScopeFilter("all"))
    .groupBy(products.status);

  const by = Object.fromEntries(rows.map((r) => [r.status, r.count]));
  const active = by["active"] ?? 0;
  const draft = by["draft"] ?? 0;
  return { all: active + draft, active, draft };
}

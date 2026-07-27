/**
 * Light server-side helpers for the thumbnail-normalization review queue:
 * queue stats and the approve / flag / skip mutations. These touch only the DB
 * and R2, so this module stays free of the heavy Sharp + vision imports (those
 * live in `./thumbnails-generate`, loaded only when proposals are generated).
 *
 * Never import from a client component — this runs Node-only code.
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  products,
  productImages,
  thumbnailProposals,
  NORMALIZED_THUMBNAIL_SOURCE as NORMALIZED_SOURCE,
} from "@/lib/db/schema";
import { makeR2Client, deleteObjectsFromR2, r2KeyFromUrl } from "@/lib/catalog/r2";

/**
 * Promote an approved proposal to the live gallery: shift existing images down
 * and insert the normalized image as the new position-0 hero (the original
 * photos are preserved, so this is reversible).
 */
export async function approveProposal(
  productId: number,
): Promise<{ ok: boolean; message: string }> {
  const prop = await db.query.thumbnailProposals.findFirst({
    where: eq(thumbnailProposals.productId, productId),
  });
  if (!prop) return { ok: false, message: "No proposal for this product." };
  if (prop.status !== "proposed" || !prop.proposalUrl) {
    return { ok: false, message: "No pending proposal to approve." };
  }

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { title: true },
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

  return { ok: true, message: "Thumbnail approved." };
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

  if (decision === "skipped" && prop.proposalUrl) {
    try {
      const bucket = process.env.R2_BUCKET_NAME;
      const key = r2KeyFromUrl(prop.proposalUrl);
      if (bucket && key) {
        await deleteObjectsFromR2(makeR2Client(), bucket, [key]);
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
  currentUrl: string | null;
};

/** Active products that don't have a proposal yet (the "not started" queue),
 *  with their current thumbnail — so the review page can list them and let the
 *  admin generate individually. */
export async function getPendingProducts(
  limit = 48,
): Promise<PendingProduct[]> {
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .leftJoin(thumbnailProposals, eq(thumbnailProposals.productId, products.id))
    .where(and(eq(products.status, "active"), isNull(thumbnailProposals.id)))
    .orderBy(asc(products.id))
    .limit(limit);

  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];

  const withImages = await db.query.products.findMany({
    where: inArray(products.id, ids),
    columns: { id: true, slug: true, title: true },
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
      currentUrl: p.images[0]?.url ?? null,
    }));
}

/** Approve many proposals in sequence (each is a fast DB/R2 op). Returns how
 *  many actually applied (non-proposed ones are skipped by approveProposal). */
export async function approveProposals(
  ids: number[],
): Promise<{ processed: number }> {
  let processed = 0;
  for (const id of ids) {
    const res = await approveProposal(id);
    if (res.ok) processed++;
  }
  return { processed };
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

/** Record a manually-uploaded image as a product's proposal (goes to "To
 *  review" so it's approved through the same flow). */
export async function setUploadedProposal(
  productId: number,
  proposalUrl: string,
): Promise<void> {
  const row = {
    productId,
    status: "proposed" as const,
    proposalUrl,
    sourceImageId: null,
    score: null,
    category: "manual",
    reason: "Manually uploaded.",
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
        sourceImageId: row.sourceImageId,
        score: row.score,
        category: row.category,
        reason: row.reason,
        updatedAt: row.updatedAt,
      },
    });
}

export type ThumbnailQueueStats = {
  pending: number;
  proposed: number;
  approved: number;
  flagged: number;
  skipped: number;
};

/** Queue counters for the review page header and the Products nav badge. */
export async function getThumbnailQueueStats(): Promise<ThumbnailQueueStats> {
  const [statusRows, pendingRow] = await Promise.all([
    db
      .select({
        status: thumbnailProposals.status,
        count: sql<number>`count(*)::int`,
      })
      .from(thumbnailProposals)
      .groupBy(thumbnailProposals.status),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(products)
      .leftJoin(
        thumbnailProposals,
        eq(thumbnailProposals.productId, products.id),
      )
      .where(and(eq(products.status, "active"), isNull(thumbnailProposals.id))),
  ]);

  const by = Object.fromEntries(statusRows.map((r) => [r.status, r.count]));
  return {
    pending: pendingRow[0]?.count ?? 0,
    proposed: by["proposed"] ?? 0,
    approved: by["approved"] ?? 0,
    flagged: by["flagged"] ?? 0,
    skipped: by["skipped"] ?? 0,
  };
}

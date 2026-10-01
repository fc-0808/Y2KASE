/**
 * Backfill perceptual fingerprints for product images that don't have a
 * current-version hash yet.
 *
 * Shared by the CLI (`npm run backfill:phash`) and the admin "Find duplicates"
 * flow. Idempotent + resumable: only rows whose `phash` is null or a previous
 * algorithm version are processed, so a v2 rollout rewrites the old 16-char
 * dHashes instead of mixing incompatible bit layouts.
 *
 * Bytes are read through {@link loadImage} (S3 API for our bucket). The public
 * `media.y2kase.com` host is Cloudflare-rate-limited under a burst of
 * `fetch`es — that's what aborted the first v2 scan at "1414 could not be
 * hashed" while the objects themselves were fine. Failures are skipped via an
 * `id` cursor so one dead row cannot pin the queue on the same 25 URLs.
 *
 * Server-only — downloads images and runs Sharp. Client code that needs the
 * result shapes imports them from `./phash-types` instead.
 */
import { and, eq, gt, isNull, like, notLike, or, sql } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { productImages } from "@/lib/db/schema";
import { fingerprintFromBuffer } from "@/lib/catalog/phash";
import { mapWithConcurrency } from "@/lib/catalog/concurrency";
import { loadImage } from "@/lib/catalog/image-source";
import {
  FINGERPRINT_PREFIX,
  PHASH_BACKFILL_BATCH_SIZE,
  PHASH_BACKFILL_CONCURRENCY,
  isCurrentFingerprint,
  type PhashBackfillBatchResult,
  type PhashCoverage,
} from "@/lib/catalog/phash-types";

const staleFingerprint = notLike(
  productImages.phash,
  `${FINGERPRINT_PREFIX}%`,
);
const needsFingerprint = or(isNull(productImages.phash), staleFingerprint);

const EMPTY_BATCH: PhashBackfillBatchResult = {
  hashed: 0,
  failed: 0,
  remaining: 0,
  scanned: 0,
  lastId: 0,
};

/** How many images / products still need a current-version fingerprint. */
export async function getPhashCoverage(): Promise<PhashCoverage> {
  if (!isDbConfigured()) {
    return {
      totalImages: 0,
      hashedImages: 0,
      missingImages: 0,
      staleImages: 0,
      unscannedProducts: 0,
    };
  }

  const [imageRow, productRows] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        hashed: sql<number>`count(*) filter (where ${like(productImages.phash, `${FINGERPRINT_PREFIX}%`)})::int`,
        missing: sql<number>`count(*) filter (where ${needsFingerprint})::int`,
        stale: sql<number>`count(*) filter (where ${productImages.phash} is not null and ${staleFingerprint})::int`,
      })
      .from(productImages),
    db.query.products.findMany({
      columns: { id: true },
      with: {
        images: {
          columns: { phash: true },
          orderBy: (img, { asc }) => asc(img.position),
          limit: 1,
        },
      },
      limit: 10000,
    }),
  ]);

  const img = imageRow[0];
  let unscannedProducts = 0;
  for (const p of productRows) {
    if (!isCurrentFingerprint(p.images[0]?.phash)) unscannedProducts++;
  }

  return {
    totalImages: img?.total ?? 0,
    hashedImages: img?.hashed ?? 0,
    missingImages: img?.missing ?? 0,
    staleImages: img?.stale ?? 0,
    unscannedProducts,
  };
}

/**
 * Hash up to `limit` images that still lack a current fingerprint, starting
 * after `afterId`. Safe for serverless: the admin UI loops this, passing
 * `lastId` back, until `scanned === 0`.
 */
export async function backfillMissingPhashes(
  limit = PHASH_BACKFILL_BATCH_SIZE,
  afterId = 0,
): Promise<PhashBackfillBatchResult> {
  if (!isDbConfigured()) return { ...EMPTY_BATCH, lastId: afterId };

  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 50));
  const cursor = Number.isFinite(afterId) ? Math.max(0, Math.floor(afterId)) : 0;

  const rows = await db.query.productImages.findMany({
    where: and(needsFingerprint, gt(productImages.id, cursor)),
    columns: { id: true, url: true },
    orderBy: (img, { asc }) => asc(img.id),
    limit: safeLimit,
  });

  if (rows.length === 0) return { ...EMPTY_BATCH, lastId: cursor };

  const outcomes = await mapWithConcurrency(
    rows,
    PHASH_BACKFILL_CONCURRENCY,
    async (row) => {
      try {
        const image = await loadImage(row.url);
        const hash = await fingerprintFromBuffer(image.bytes);
        if (!hash) throw new Error("could not fingerprint image");

        await db
          .update(productImages)
          .set({ phash: hash })
          .where(eq(productImages.id, row.id));
        return "hashed" as const;
      } catch {
        // Leave the row unchanged. The cursor still advances so a 404 or a
        // transient fault cannot pin the next batch on the same 25 URLs.
        return "failed" as const;
      }
    },
  );

  let hashed = 0;
  let failed = 0;
  for (const outcome of outcomes) {
    if (outcome === "hashed") hashed += 1;
    else failed += 1;
  }

  const lastId = rows[rows.length - 1]!.id;
  const [left] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(productImages)
    .where(and(needsFingerprint, gt(productImages.id, lastId)));

  return {
    hashed,
    failed,
    remaining: left?.count ?? 0,
    scanned: rows.length,
    lastId,
  };
}

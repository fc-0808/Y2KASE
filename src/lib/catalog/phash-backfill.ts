/**
 * Backfill perceptual hashes for product images that don't have one yet.
 *
 * Shared by the CLI (`npm run backfill:phash`) and the admin "Find duplicates"
 * flow. Idempotent + resumable: only rows where `phash IS NULL` are processed.
 *
 * Server-only — downloads images and runs Sharp. Client code that needs the
 * result shapes imports them from `./phash-types` instead.
 */
import { eq, isNull, sql } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { productImages } from "@/lib/db/schema";
import { dhashFromBuffer } from "@/lib/catalog/phash";
import {
  PHASH_BACKFILL_BATCH_SIZE,
  type PhashBackfillBatchResult,
  type PhashCoverage,
} from "@/lib/catalog/phash-types";

/** How many images / products still need fingerprinting. */
export async function getPhashCoverage(): Promise<PhashCoverage> {
  if (!isDbConfigured()) {
    return {
      totalImages: 0,
      hashedImages: 0,
      missingImages: 0,
      unscannedProducts: 0,
    };
  }

  const [imageRow, productRows] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        hashed: sql<number>`count(*) filter (where ${productImages.phash} is not null)::int`,
        missing: sql<number>`count(*) filter (where ${productImages.phash} is null)::int`,
      })
      .from(productImages),
    // Mirror findDuplicateClusters: primary = lowest position. Count products
    // that can't join the duplicate scan yet.
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
    if (!p.images[0]?.phash) unscannedProducts++;
  }

  return {
    totalImages: img?.total ?? 0,
    hashedImages: img?.hashed ?? 0,
    missingImages: img?.missing ?? 0,
    unscannedProducts,
  };
}

/**
 * Hash up to `limit` images that still lack a phash. Safe for serverless:
 * each call is bounded so the admin UI can loop until `remaining === 0`.
 */
export async function backfillMissingPhashes(
  limit = PHASH_BACKFILL_BATCH_SIZE,
): Promise<PhashBackfillBatchResult> {
  if (!isDbConfigured()) {
    return { hashed: 0, failed: 0, remaining: 0 };
  }

  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 50));
  const rows = await db.query.productImages.findMany({
    where: isNull(productImages.phash),
    columns: { id: true, url: true },
    limit: safeLimit,
  });

  let hashed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const res = await fetch(row.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const hash = await dhashFromBuffer(buf);
      if (!hash) throw new Error("could not decode image");

      await db
        .update(productImages)
        .set({ phash: hash })
        .where(eq(productImages.id, row.id));
      hashed++;
    } catch {
      failed++;
    }
  }

  const [left] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(productImages)
    .where(isNull(productImages.phash));

  return {
    hashed,
    failed,
    remaining: left?.count ?? 0,
  };
}

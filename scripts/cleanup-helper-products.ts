/**
 * Audit / remove catalog rows accidentally ingested from generator internals.
 *
 * Dry-run (default):
 *   npm run catalog:audit-helper-products
 *
 * Delete malformed DRAFT products, their unshared R2 media, and local tracker
 * rows:
 *   npm run catalog:cleanup-helper-products
 *
 * Active products are always refused unless `--include-active` is explicitly
 * supplied. This script does not rebuild galleries: restore the source output,
 * run cleanup, then ingest again after discovery has selected the parent.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { inArray } from "drizzle-orm";

import { db } from "../src/lib/db";
import { productImages, products } from "../src/lib/db/schema";
import { isInternalMediaDirectory } from "../src/lib/catalog/discover";
import {
  deleteObjectsFromR2,
  makeR2Client,
  r2KeyFromUrl,
} from "../src/lib/catalog/r2";

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function helperDirectory(sourceFolder: string | null): string | null {
  if (!sourceFolder) return null;
  const leaf = sourceFolder.split(/[\\/]/).filter(Boolean).at(-1);
  return leaf && isInternalMediaDirectory(leaf) ? leaf.toLowerCase() : null;
}

function removeTrackerRows(ids: readonly number[]): number {
  if (ids.length === 0) return 0;
  const file = path.resolve(
    process.env.CATALOG_DB_PATH ?? "./data/catalog.db",
  );
  if (!fs.existsSync(file)) return 0;

  const sqlite = new Database(file);
  try {
    const placeholders = ids.map(() => "?").join(",");
    return sqlite
      .prepare(
        `DELETE FROM catalog_products WHERE neon_id IN (${placeholders})`,
      )
      .run(...ids).changes;
  } finally {
    sqlite.close();
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  const apply = hasFlag("--apply");
  const includeActive = hasFlag("--include-active");
  const rows = await db.query.products.findMany({
    columns: {
      id: true,
      title: true,
      slug: true,
      status: true,
      sourceFolder: true,
      videoUrl: true,
    },
    with: {
      images: {
        columns: { id: true, url: true, sourceFilename: true },
      },
    },
  });

  const affected = rows
    .map((product) => ({
      ...product,
      helper: helperDirectory(product.sourceFolder),
    }))
    .filter(
      (
        product,
      ): product is typeof product & {
        helper: string;
      } => product.helper !== null,
    )
    .sort((a, b) => a.id - b.id);

  if (affected.length === 0) {
    console.log("No products were ingested from _originals/_removed.");
    return;
  }

  const active = affected.filter((product) => product.status === "active");
  const deletable = includeActive
    ? affected
    : affected.filter((product) => product.status !== "active");

  console.log(
    `\nFound ${affected.length} malformed helper-folder product(s): ` +
      `${affected.filter((p) => p.helper === "_originals").length} _originals, ` +
      `${affected.filter((p) => p.helper === "_removed").length} _removed.\n`,
  );
  for (const product of affected) {
    console.log(
      `  #${product.id} [${product.status}] ${product.images.length} image(s) ` +
        `${product.sourceFolder}\n    ${product.title}`,
    );
  }

  if (!apply) {
    console.log(
      `\nDry-run only. Restore/recreate the parent galleries, then run:\n` +
        `  npm run catalog:cleanup-helper-products\n` +
        `and re-ingest the corrected source root.\n`,
    );
    return;
  }

  if (active.length > 0 && !includeActive) {
    console.error(
      `\nRefusing to delete ${active.length} active product(s). Unpublish/review them first, or explicitly pass --include-active.`,
    );
    process.exitCode = 2;
    return;
  }
  if (deletable.length === 0) return;

  const targetIds = deletable.map((product) => product.id);
  const targetIdSet = new Set(targetIds);
  const backupDir = path.resolve(process.cwd(), "data");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(
    backupDir,
    `helper-products-backup-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(
    backupFile,
    `${JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        reason: "Pre-cleanup backup of products ingested from _originals/_removed",
        products: deletable,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`\nBackup written: ${backupFile}`);

  // Object keys from the old sanitizer can collide. Never delete a URL still
  // referenced by a product outside this cleanup set.
  const [allImageRefs, allProductRefs] = await Promise.all([
    db
      .select({ productId: productImages.productId, url: productImages.url })
      .from(productImages),
    db
      .select({ id: products.id, videoUrl: products.videoUrl })
      .from(products),
  ]);
  const retainedUrls = new Set<string>();
  for (const image of allImageRefs) {
    if (!targetIdSet.has(image.productId)) retainedUrls.add(image.url);
  }
  for (const product of allProductRefs) {
    if (!targetIdSet.has(product.id) && product.videoUrl) {
      retainedUrls.add(product.videoUrl);
    }
  }

  const targetUrls = deletable.flatMap((product) => [
    ...product.images.map((image) => image.url),
    ...(product.videoUrl ? [product.videoUrl] : []),
  ]);
  const keys = Array.from(
    new Set(
      targetUrls
        .filter((url) => !retainedUrls.has(url))
        .map(r2KeyFromUrl)
        .filter((key): key is string => key !== null),
    ),
  );

  const deleted = await db
    .delete(products)
    .where(inArray(products.id, targetIds))
    .returning({ id: products.id });
  const trackerRows = removeTrackerRows(deleted.map((product) => product.id));

  let storageNote = "R2 cleanup skipped (credentials unavailable).";
  if (keys.length > 0 && process.env.R2_BUCKET_NAME) {
    try {
      await deleteObjectsFromR2(
        makeR2Client(),
        process.env.R2_BUCKET_NAME,
        keys,
      );
      storageNote = `Deleted ${keys.length} unshared R2 object(s).`;
    } catch (err) {
      storageNote = `Database cleanup succeeded; R2 cleanup failed: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
  }

  console.log(
    `\nDeleted ${deleted.length} malformed product(s) and ${trackerRows} tracker row(s). ${storageNote}\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

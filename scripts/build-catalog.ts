/**
 * scripts/build-catalog.ts
 *
 * Bulk ingest pipeline:  a folder of product folders → R2 + Neon (as drafts)
 *
 *   npm run build:catalog
 *   npm run build:catalog -- --dir "C:\path\to\folders" --type iphone_case
 *
 * Defaults: dir = LOCAL_CATALOG_ROOT (./bestListings), type = iphone_case.
 *
 * Product type, pricing, copy, collections and publish status are resolved
 * per-folder from (in precedence order):
 *   1. `<productFolder>/listing.json`   — per-product overrides
 *   2. `catalog.config.json` category rule (by top-level folder)
 *   3. `catalog.config.json` defaults
 *   4. the CLI `--type` flag / env  (this script's fallback)
 * This lets one tree mix product types and pin deterministic data while AI
 * fills any gaps. See src/lib/catalog/manifest.ts.
 *
 * Per product folder it:
 *   1. Hashes images (sha256) + the manifest for idempotency — skips unchanged
 *      + pushed folders, and re-ingests when a manifest is edited
 *   2. Converts images → WebP, classifies each image's Style (case/grip/charm)
 *   3. Generates SEO copy with GPT vision (skipped when the manifest pins it)
 *   4. Uploads images + primary video to Cloudflare R2
 *   5. Inserts the product (+ images, options, video, type) into Neon
 *   6. Tracks progress in data/catalog.db so re-runs are resumable and free
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { discoverProductFolders } from "../src/lib/catalog/discover";
import { makeR2Client } from "../src/lib/catalog/r2";
import { ingestProductFolder, sha256 } from "../src/lib/catalog/ingest";
import { getProductType } from "../src/lib/catalog/product-types";
import { loadCatalogConfig, resolveListing } from "../src/lib/catalog/manifest";
import { mapWithConcurrency } from "../src/lib/catalog/concurrency";
import {
  loadDuplicateIndex,
  nearestInIndex,
} from "../src/lib/catalog/duplicates";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function parseArgs(): { dir: string; type: string } {
  const args = process.argv.slice(2);
  let dir =
    process.env.INGEST_DIR ??
    process.env.LOCAL_CATALOG_ROOT ??
    "./bestListings";
  let type = process.env.INGEST_PRODUCT_TYPE ?? "iphone_case";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dir" && args[i + 1]) dir = args[++i];
    else if (args[i] === "--type" && args[i + 1]) type = args[++i];
    else if (!args[i].startsWith("--")) dir = args[i];
  }
  return { dir, type };
}

function initCatalogDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS catalog_products (
      folder_path   TEXT PRIMARY KEY,
      product_type  TEXT NOT NULL DEFAULT 'iphone_case',
      image_hashes  TEXT NOT NULL,
      neon_id       INTEGER,
      slug          TEXT,
      status        TEXT NOT NULL DEFAULT 'pending',
      error         TEXT,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
  // Best-effort migration for older catalog.db files.
  try {
    db.exec(
      `ALTER TABLE catalog_products ADD COLUMN product_type TEXT NOT NULL DEFAULT 'iphone_case'`,
    );
  } catch {
    /* column already exists */
  }

  // Self-heal legacy schemas: older catalog.db files carried extra NOT NULL
  // columns (e.g. `category`) that the current pipeline no longer writes, which
  // would fail every insert. Drop any column not in the canonical set so a
  // stale local cache can never break ingestion.
  const KNOWN_COLUMNS = new Set([
    "folder_path",
    "product_type",
    "image_hashes",
    "neon_id",
    "slug",
    "status",
    "error",
    "created_at",
    "updated_at",
  ]);
  try {
    const cols = db.prepare(`PRAGMA table_info(catalog_products)`).all() as {
      name: string;
    }[];
    for (const c of cols) {
      if (!KNOWN_COLUMNS.has(c.name)) {
        try {
          db.exec(`ALTER TABLE catalog_products DROP COLUMN "${c.name}"`);
        } catch {
          /* older SQLite without DROP COLUMN — ignore */
        }
      }
    }
  } catch {
    /* PRAGMA unavailable — ignore */
  }
  return db;
}

async function main() {
  requireEnv("DATABASE_URL");
  requireEnv("OPENAI_API_KEY");
  const bucket = requireEnv("R2_BUCKET_NAME");
  requireEnv("R2_ACCOUNT_ID");
  requireEnv("R2_ACCESS_KEY_ID");
  requireEnv("R2_SECRET_ACCESS_KEY");
  requireEnv("R2_PUBLIC_URL");

  const { dir, type: cliType } = parseArgs();
  // `--type auto` lets the vision model classify each product's type; the
  // fallback is used only when AI can't decide and nothing pins the type.
  const autoMode = cliType === "auto";
  const fallbackType = autoMode ? "iphone_case" : cliType;
  const fallbackCurrency = process.env.NEXT_PUBLIC_STORE_CURRENCY ?? "USD";
  const catalogPath = process.env.CATALOG_DB_PATH ?? "./data/catalog.db";

  const resolved = path.resolve(dir);
  if (!fs.existsSync(resolved))
    throw new Error(`Directory not found: ${resolved}`);

  fs.mkdirSync(path.dirname(path.resolve(catalogPath)), { recursive: true });
  const catalogDb = initCatalogDb(path.resolve(catalogPath));
  const r2 = makeR2Client();

  const catalogConfig = loadCatalogConfig(resolved);
  const folders = discoverProductFolders(resolved);
  console.log(
    `\nFound ${folders.length} product folder(s) in ${resolved}\n` +
      (autoMode
        ? `Product type: AI auto-detect (fallback ${getProductType(fallbackType).label})\n`
        : `Product type: ${getProductType(fallbackType).label} (${fallbackType})\n`),
  );

  let created = 0;
  let skipped = 0;
  let failed = 0;
  let duplicates = 0;
  let autoTyped = 0;

  // Load every existing product's primary-image fingerprint ONCE, then match
  // each new product against this in-memory index (and append to it as we go),
  // instead of a full DB scan per product.
  const dupIndex = await loadDuplicateIndex();

  // Process products with bounded concurrency to overlap the slow parts (AI
  // latency, image uploads). Default 3 — high enough to hide latency, low
  // enough to respect the vision provider's rate limits. Tune via env.
  const concurrency = Math.max(1, Number(process.env.INGEST_CONCURRENCY) || 3);
  console.log(`Concurrency: ${concurrency}\n`);

  await mapWithConcurrency(folders, concurrency, async (folder, i) => {
    const { resolved: listing, manifestRaw } = resolveListing({
      folderPath: folder.folderPath,
      absFolder: folder.absPath,
      config: catalogConfig,
      fallbackProductType: fallbackType,
      fallbackCurrency,
    });
    const productType = getProductType(listing.productTypeId);
    // Auto-classify only when nothing pinned the type and we're in auto mode.
    const useAuto = autoMode && !listing.productTypeExplicit;

    const label = `[${i + 1}/${folders.length}] ${listing.sku ?? folder.folderPath}`;
    // Fold the manifest into the idempotency hash so editing listing.json
    // (e.g. a new price or title) re-ingests the folder on the next run.
    const hashesJson = JSON.stringify({
      images: folder.imageFiles.map((f) => sha256(fs.readFileSync(f))),
      manifest: manifestRaw,
      type: productType.id,
    });

    const existing = catalogDb
      .prepare(
        "SELECT status, image_hashes FROM catalog_products WHERE folder_path = ?",
      )
      .get(folder.folderPath) as
      | { status: string; image_hashes: string }
      | undefined;

    if (existing?.status === "pushed" && existing.image_hashes === hashesJson) {
      console.log(`${label} — skipped (already pushed)`);
      skipped++;
      return;
    }

    console.log(
      `\n${label} — ${useAuto ? "auto" : productType.id}, ` +
        `${folder.imageFiles.length} image(s), ${folder.videoFiles.length} video(s)`,
    );

    try {
      catalogDb
        .prepare(
          `INSERT INTO catalog_products (folder_path, product_type, image_hashes, status, updated_at)
         VALUES (?, ?, ?, 'pending', unixepoch())
         ON CONFLICT(folder_path) DO UPDATE SET
           product_type = excluded.product_type,
           image_hashes = excluded.image_hashes,
           status = 'pending', error = NULL, updated_at = unixepoch()`,
        )
        .run(folder.folderPath, productType.id, hashesJson);

      const result = await ingestProductFolder({
        folder,
        productTypeId: useAuto ? "auto" : productType.id,
        fallbackProductTypeId: productType.id,
        r2,
        bucket,
        currency: listing.currency,
        overrides: {
          sku: listing.sku,
          title: listing.title,
          description: listing.description,
          tags: listing.tags,
          materials: listing.materials,
          altText: listing.altText,
          price: listing.price,
          status: listing.status,
          collections: listing.collections,
        },
        detectDuplicate: (ph) => nearestInIndex(dupIndex, ph),
        log: (m) => console.log(`  ${m}`),
      });

      catalogDb
        .prepare(
          `UPDATE catalog_products
           SET neon_id = ?, slug = ?, status = 'pushed', updated_at = unixepoch()
           WHERE folder_path = ?`,
        )
        .run(result.productId, result.slug, folder.folderPath);

      // Grow the in-memory index so later products in this batch can match
      // this one too.
      if (result.primaryPhash) {
        dupIndex.push({
          id: result.productId,
          slug: result.slug,
          title: result.title,
          phash: result.primaryPhash,
        });
      }

      console.log(
        `  ✓ #${result.productId} → /products/${result.slug}  ` +
          `[${result.productType}${result.autoDetectedType ? " · ai" : ""}]` +
          (result.hasVideo ? "  [+video]" : "") +
          (result.duplicateOf
            ? `  ⚠ possible dup of #${result.duplicateOf.id}`
            : ""),
      );
      created++;
      if (result.duplicateOf) duplicates++;
      if (result.autoDetectedType) autoTyped++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      catalogDb
        .prepare(
          `UPDATE catalog_products SET error = ?, status = 'error', updated_at = unixepoch()
           WHERE folder_path = ?`,
        )
        .run(msg, folder.folderPath);
      console.error(`  ✗ FAILED: ${msg}`);
      failed++;
    }
  });

  catalogDb.close();
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Done.  Created: ${created}  Skipped: ${skipped}  Failed: ${failed}
  AI-typed: ${autoTyped}  Possible duplicates: ${duplicates}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Review drafts at      http://localhost:3000/admin/products
${duplicates > 0 ? "  Review duplicates at http://localhost:3000/admin/products/duplicates\n" : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

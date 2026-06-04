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
 * Per product folder it:
 *   1. Hashes images (sha256) for idempotency — skips unchanged + pushed folders
 *   2. Converts images → WebP, classifies each image's Style (case/grip/charm)
 *   3. Generates SEO copy with GPT vision
 *   4. Uploads images + primary video to Cloudflare R2
 *   5. Inserts a draft product (+ images, options, video, type) into Neon
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

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function parseArgs(): { dir: string; type: string } {
  const args = process.argv.slice(2);
  let dir = process.env.INGEST_DIR ?? process.env.LOCAL_CATALOG_ROOT ?? "./bestListings";
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
    db.exec(`ALTER TABLE catalog_products ADD COLUMN product_type TEXT NOT NULL DEFAULT 'iphone_case'`);
  } catch {
    /* column already exists */
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

  const { dir, type } = parseArgs();
  const productType = getProductType(type);
  const currency = process.env.NEXT_PUBLIC_STORE_CURRENCY ?? "USD";
  const catalogPath = process.env.CATALOG_DB_PATH ?? "./data/catalog.db";

  const resolved = path.resolve(dir);
  if (!fs.existsSync(resolved)) throw new Error(`Directory not found: ${resolved}`);

  fs.mkdirSync(path.dirname(path.resolve(catalogPath)), { recursive: true });
  const catalogDb = initCatalogDb(path.resolve(catalogPath));
  const r2 = makeR2Client();

  const folders = discoverProductFolders(resolved);
  console.log(
    `\nFound ${folders.length} product folder(s) in ${resolved}\n` +
      `Product type: ${productType.label} (${productType.id})\n`,
  );

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const [i, folder] of folders.entries()) {
    const label = `[${i + 1}/${folders.length}] ${folder.folderPath}`;
    const hashesJson = JSON.stringify(
      folder.imageFiles.map((f) => sha256(fs.readFileSync(f))),
    );

    const existing = catalogDb
      .prepare("SELECT status, image_hashes FROM catalog_products WHERE folder_path = ?")
      .get(folder.folderPath) as
      | { status: string; image_hashes: string }
      | undefined;

    if (existing?.status === "pushed" && existing.image_hashes === hashesJson) {
      console.log(`${label} — skipped (already pushed)`);
      skipped++;
      continue;
    }

    console.log(
      `\n${label} — ${folder.imageFiles.length} image(s), ${folder.videoFiles.length} video(s)`,
    );

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

    try {
      const result = await ingestProductFolder({
        folder,
        productTypeId: productType.id,
        r2,
        bucket,
        currency,
        log: (m) => console.log(`  ${m}`),
      });

      catalogDb
        .prepare(
          `UPDATE catalog_products
           SET neon_id = ?, slug = ?, status = 'pushed', updated_at = unixepoch()
           WHERE folder_path = ?`,
        )
        .run(result.productId, result.slug, folder.folderPath);

      console.log(
        `  ✓ #${result.productId} → /products/${result.slug}` +
          (result.hasVideo ? "  [+video]" : ""),
      );
      created++;
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
  }

  catalogDb.close();
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Done.  Created: ${created}  Skipped: ${skipped}  Failed: ${failed}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Review drafts at http://localhost:3000/admin/products
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

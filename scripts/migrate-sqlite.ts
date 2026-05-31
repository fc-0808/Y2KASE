/**
 * One-time import: legacy SQLite `golden_records` -> Neon Postgres.
 *
 *   npm run import:catalog
 *
 * Idempotent: re-running upserts products by slug and rebuilds their
 * images/options. Prices are converted from the legacy HKD values to the
 * store currency using IMPORT_HKD_TO_USD_RATE.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import path from "node:path";
import Database from "better-sqlite3";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const { products, productImages, productOptions, provenanceEvents } = schema;

type GoldenRecord = {
  canonical_slug: string;
  merged_title: string;
  total_quantity: number | null;
  highest_price: number | null;
  merged_tags: string | null;
  merged_images: string | null;
  description: string | null;
  materials: string | null;
  currency_code: string | null;
  variation1_name: string | null;
  variation1_vals: string | null;
  variation2_name: string | null;
  variation2_vals: string | null;
  sku: string | null;
  source_shops: string | null;
  shopify_product_id: string | null;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function parseImages(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseOptionValues(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const sqlitePath = path.resolve(
    process.env.LEGACY_SQLITE_PATH ??
      "../Y2KASE_Shopify/data/mdm_catalog.db",
  );
  const hkdToUsd = Number(process.env.IMPORT_HKD_TO_USD_RATE ?? "0.128");
  const targetCurrency = process.env.NEXT_PUBLIC_STORE_CURRENCY ?? "USD";

  console.log(`Reading legacy catalog from: ${sqlitePath}`);
  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const rows = sqlite
    .prepare(
      `SELECT canonical_slug, merged_title, total_quantity, highest_price,
              merged_tags, merged_images, description, materials, currency_code,
              variation1_name, variation1_vals, variation2_name, variation2_vals,
              sku, source_shops, shopify_product_id
       FROM golden_records
       WHERE merged_title IS NOT NULL AND merged_title != ''`,
    )
    .all() as GoldenRecord[];
  sqlite.close();

  console.log(`Found ${rows.length} golden records.`);

  const sql = neon(databaseUrl);
  const db = drizzle(sql, { schema });

  let inserted = 0;
  let updated = 0;

  for (const r of rows) {
    const slug = r.canonical_slug?.trim();
    if (!slug) continue;

    const priceUsd = r.highest_price ? +(r.highest_price * hkdToUsd).toFixed(2) : 0;
    const tags = parseTags(r.merged_tags);
    const images = parseImages(r.merged_images);

    const existing = await db.query.products.findFirst({
      where: eq(products.slug, slug),
      columns: { id: true },
    });

    const productValues = {
      slug,
      title: r.merged_title,
      description: r.description,
      price: String(priceUsd),
      currency: targetCurrency,
      materials: r.materials,
      tags,
      status: "active" as const,
      totalQuantity: r.total_quantity ?? 0,
      sourceShops: r.source_shops,
      legacyShopifyId: r.shopify_product_id,
      updatedAt: new Date(),
    };

    let productId: number;
    if (existing) {
      await db.update(products).set(productValues).where(eq(products.id, existing.id));
      productId = existing.id;
      // Rebuild child rows for a clean re-import.
      await db.delete(productImages).where(eq(productImages.productId, productId));
      await db.delete(productOptions).where(eq(productOptions.productId, productId));
      updated++;
    } else {
      const [created] = await db
        .insert(products)
        .values(productValues)
        .returning({ id: products.id });
      productId = created.id;
      inserted++;
    }

    if (images.length > 0) {
      await db.insert(productImages).values(
        images.map((url, i) => ({
          productId,
          url,
          position: i,
          altText: r.merged_title,
        })),
      );
    }

    const optionRows: {
      productId: number;
      name: string;
      position: number;
      values: string[];
    }[] = [];
    if (r.variation1_name && r.variation1_vals) {
      optionRows.push({
        productId,
        name: r.variation1_name,
        position: 0,
        values: parseOptionValues(r.variation1_vals),
      });
    }
    if (r.variation2_name && r.variation2_vals) {
      optionRows.push({
        productId,
        name: r.variation2_name,
        position: 1,
        values: parseOptionValues(r.variation2_vals),
      });
    }
    if (optionRows.length > 0) {
      await db.insert(productOptions).values(optionRows);
    }

    await db.insert(provenanceEvents).values({
      productId,
      canonicalSlug: slug,
      eventType: existing ? "import.update" : "import.insert",
      eventData: { source: "mdm_catalog.db", sourceShops: r.source_shops },
    });
  }

  console.log(
    `Done. Inserted ${inserted}, updated ${updated}, total ${rows.length}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

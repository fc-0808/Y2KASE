/**
 * Idempotent DDL for the products brand-classification columns + index.
 * Mirrors the Drizzle schema. Safe to re-run.
 *
 *   npm run db:brand
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);

  await sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "brand_name" text`;
  await sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "character_name" text`;
  await sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "brand_confidence" text`;
  await sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "brand_evidence" jsonb NOT NULL DEFAULT '[]'`;
  await sql`CREATE INDEX IF NOT EXISTS "products_brand_idx" ON "products" ("brand_name")`;

  console.log("✓ products.brand_* columns + index applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

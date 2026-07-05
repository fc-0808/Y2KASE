/**
 * One-off, idempotent DDL for the product_images perceptual-hash column +
 * index. Mirrors the Drizzle schema and the style of apply-reviews-schema.ts.
 * Safe to re-run.
 *
 *   npm run db:phash
 *
 * After applying, backfill hashes for existing images with:
 *   npm run backfill:phash
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);

  await sql`ALTER TABLE "product_images" ADD COLUMN IF NOT EXISTS "phash" text`;
  await sql`CREATE INDEX IF NOT EXISTS "product_images_phash_idx" ON "product_images" ("phash")`;

  console.log("✓ product_images.phash column + index applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

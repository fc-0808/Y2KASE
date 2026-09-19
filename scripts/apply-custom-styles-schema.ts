/**
 * One-off, idempotent DDL for multi-product listings and custom variations.
 * Mirrors the Drizzle schema. Safe to re-run.
 *
 *   npm run db:custom-styles
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);

  await sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "contains_multiple_products" boolean NOT NULL DEFAULT false`;
  await sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "custom_styles" jsonb NOT NULL DEFAULT '[]'::jsonb`;

  console.log(
    "✓ products.contains_multiple_products + products.custom_styles applied.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * One-off, idempotent DDL for the curated-bestsellers ordering column.
 * Mirrors the Drizzle schema. Safe to re-run.
 *
 *   npm run db:featured
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);

  await sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "featured_position" integer`;
  await sql`CREATE INDEX IF NOT EXISTS "products_featured_pos_idx" ON "products" ("featured", "featured_position")`;

  console.log("✓ products.featured_position column + index applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

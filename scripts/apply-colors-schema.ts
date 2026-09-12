/**
 * One-off, idempotent DDL for the product color facet.
 * Mirrors the Drizzle schema. Safe to re-run.
 *
 *   npm run db:colors
 *
 * After applying, classify the existing catalogue with:
 *   npm run backfill:colors
 *   npm run backfill:colors:apply
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);

  await sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "colors" text[] NOT NULL DEFAULT '{}'`;
  await sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "colors_locked" boolean NOT NULL DEFAULT false`;
  await sql`CREATE INDEX IF NOT EXISTS "products_colors_gin_idx" ON "products" USING GIN ("colors")`;

  console.log("✓ products.colors column + GIN index + colors_locked applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * One-off, idempotent DDL for the product motif facet.
 * Mirrors the Drizzle schema. Safe to re-run.
 *
 *   npm run db:motifs
 *
 * After applying, classify the existing catalogue with:
 *   npm run backfill:motifs
 *   npm run backfill:motifs:apply
 *
 * And seed the Originals collection:
 *   npm run seed:collections
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);

  await sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "motifs" text[] NOT NULL DEFAULT '{}'`;
  await sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "motifs_locked" boolean NOT NULL DEFAULT false`;
  await sql`CREATE INDEX IF NOT EXISTS "products_motifs_gin_idx" ON "products" USING GIN ("motifs")`;

  console.log("✓ products.motifs column + GIN index + motifs_locked applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

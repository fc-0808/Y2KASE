/**
 * One-off, idempotent DDL for the products MagSafe-review flag + index.
 * Mirrors the Drizzle schema. Safe to re-run.
 *
 *   npm run db:magsafe
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);

  await sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "needs_magsafe_review" boolean NOT NULL DEFAULT false`;
  await sql`CREATE INDEX IF NOT EXISTS "products_magsafe_review_idx" ON "products" ("needs_magsafe_review")`;

  console.log("✓ products.needs_magsafe_review column + index applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

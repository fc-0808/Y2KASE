/**
 * One-off, idempotent DDL adding the geo-location column to the orders table.
 * Stores the ISO country code inferred from the shopper's edge geo at checkout
 * so pending/abandoned guest orders carry a location signal (no raw IPs / PII).
 *
 * Mirrors the Drizzle schema and the style of apply-fulfillment-schema.ts. Safe
 * to re-run — the statement is ADD COLUMN IF NOT EXISTS.
 *
 *   npm run db:geo
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);

  await sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "geo_country" text`;

  console.log("✓ Geo schema applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

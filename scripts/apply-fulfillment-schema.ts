/**
 * One-off, idempotent DDL adding fulfillment + lifecycle-email columns to the
 * orders table (tracking, shipped timestamp, and exactly-once email guards).
 *
 * Mirrors the Drizzle schema and the style of apply-orders-schema.ts. Safe to
 * re-run — every statement is ADD COLUMN IF NOT EXISTS.
 *
 *   npm run db:fulfillment
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);

  await sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tracking_number" text`;
  await sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "carrier" text`;
  await sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tracking_url" text`;
  await sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipped_at" timestamptz`;
  await sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipment_email_sent_at" timestamptz`;
  await sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "abandoned_email_sent_at" timestamptz`;

  console.log("✓ Fulfillment schema applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

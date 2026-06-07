/**
 * Applies ALL pending schema migrations to the production database.
 * Runs fulfillment columns + reviews table in one idempotent pass.
 * Usage: npx tsx scripts/migrate-production.ts
 */
import { config } from "dotenv";
config({ path: ".env.production.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = neon(url);

  console.log("🚀 Applying pending production schema migrations...\n");

  // ── 1. Fulfillment columns on orders ────────────────────────────────────────
  await sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tracking_number" text`;
  await sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "carrier" text`;
  await sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tracking_url" text`;
  await sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipped_at" timestamptz`;
  await sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipment_email_sent_at" timestamptz`;
  await sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "abandoned_email_sent_at" timestamptz`;
  console.log("✓ Fulfillment columns added to orders");

  // ── 2. Reviews table ─────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS "reviews" (
      "id" serial PRIMARY KEY,
      "product_id" integer NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
      "order_id" integer REFERENCES "orders"("id") ON DELETE SET NULL,
      "user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
      "author_name" text NOT NULL,
      "author_email" text,
      "rating" integer NOT NULL,
      "title" text,
      "body" text NOT NULL,
      "status" text NOT NULL DEFAULT 'pending',
      "verified" boolean NOT NULL DEFAULT false,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "published_at" timestamptz
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS "reviews_product_idx" ON "reviews" ("product_id")`;
  await sql`CREATE INDEX IF NOT EXISTS "reviews_status_idx" ON "reviews" ("status")`;
  console.log("✓ reviews table created");

  // ── 3. review_request_email_sent_at on orders ─────────────────────────────
  await sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "review_request_email_sent_at" timestamptz`;
  console.log("✓ review_request_email_sent_at column added to orders");

  console.log("\n✅ All production migrations applied successfully.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});

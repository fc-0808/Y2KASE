/**
 * One-off, idempotent DDL for the reviews table + the orders review-request
 * email guard column. Mirrors the Drizzle schema and the style of
 * apply-orders-schema.ts. Safe to re-run.
 *
 *   npm run db:reviews
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);

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

  await sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "review_request_email_sent_at" timestamptz`;

  console.log("✓ Reviews schema applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * One-off, idempotent DDL for the orders + order_items tables.
 *
 * Mirrors the Drizzle schema in src/lib/db/schema.ts and the style of
 * apply-collections-schema.ts so we avoid drizzle-kit push's interactive TTY
 * prompt. Safe to re-run — uses CREATE TABLE IF NOT EXISTS and guarded ALTERs.
 *
 *   npm run db:orders
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);

  await sql`
    CREATE TABLE IF NOT EXISTS "orders" (
      "id" serial PRIMARY KEY,
      "user_id" text,
      "email" text NOT NULL,
      "status" text NOT NULL DEFAULT 'pending',
      "subtotal_cents" integer NOT NULL,
      "shipping_cents" integer NOT NULL DEFAULT 0,
      "tax_cents" integer NOT NULL DEFAULT 0,
      "total_cents" integer NOT NULL,
      "currency" text NOT NULL DEFAULT 'USD',
      "shipping_address" jsonb,
      "stripe_payment_intent_id" text,
      "stripe_session_id" text,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )
  `;

  // user_id FK added separately so re-runs don't fail if it already exists.
  await sql`
    DO $$ BEGIN
      ALTER TABLE "orders"
        ADD CONSTRAINT "orders_user_fk"
        FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `;

  // Added after initial release — safe to run on existing tables.
  await sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "confirmation_email_sent_at" timestamptz`;

  await sql`CREATE INDEX IF NOT EXISTS "orders_user_idx" ON "orders" ("user_id")`;
  await sql`CREATE INDEX IF NOT EXISTS "orders_email_idx" ON "orders" ("email")`;
  await sql`CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "orders" ("status")`;
  // Fast idempotent lookup from the Stripe webhook + success page.
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "orders_stripe_session_idx" ON "orders" ("stripe_session_id")`;

  await sql`
    CREATE TABLE IF NOT EXISTS "order_items" (
      "id" serial PRIMARY KEY,
      "order_id" integer NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
      "product_id" integer REFERENCES "products"("id") ON DELETE SET NULL,
      "product_slug" text NOT NULL,
      "product_title" text NOT NULL,
      "image_url" text,
      "option_values" jsonb,
      "quantity" integer NOT NULL,
      "unit_cents" integer NOT NULL
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS "order_items_order_idx" ON "order_items" ("order_id")`;

  console.log("✓ Orders schema applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

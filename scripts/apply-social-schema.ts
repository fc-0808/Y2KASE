/**
 * One-off, idempotent DDL for the social_creatives table (Social Studio).
 * Mirrors the Drizzle schema and the style of apply-reviews-schema.ts.
 * Safe to re-run.
 *
 *   npm run db:social
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);

  await sql`
    CREATE TABLE IF NOT EXISTS "social_creatives" (
      "id" serial PRIMARY KEY,
      "product_id" integer REFERENCES "products"("id") ON DELETE SET NULL,
      "product_title" text,
      "preset" text NOT NULL,
      "platform" text NOT NULL DEFAULT 'generic',
      "image_url" text NOT NULL,
      "prompt" text NOT NULL,
      "caption" text,
      "hashtags" text[] NOT NULL DEFAULT '{}',
      "status" text NOT NULL DEFAULT 'draft',
      "model" text,
      "cost_cents" integer,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "published_at" timestamptz
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS "social_creatives_status_idx" ON "social_creatives" ("status")`;
  await sql`CREATE INDEX IF NOT EXISTS "social_creatives_product_idx" ON "social_creatives" ("product_id")`;

  console.log("✓ Social Studio schema applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

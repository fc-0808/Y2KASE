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

  // Publishing columns (added in the P3 Pinterest publishing release). Safe to
  // run against an existing table — each column is created only if missing.
  await sql`ALTER TABLE "social_creatives" ADD COLUMN IF NOT EXISTS "scheduled_at" timestamptz`;
  await sql`ALTER TABLE "social_creatives" ADD COLUMN IF NOT EXISTS "board_id" text`;
  await sql`ALTER TABLE "social_creatives" ADD COLUMN IF NOT EXISTS "external_id" text`;
  await sql`ALTER TABLE "social_creatives" ADD COLUMN IF NOT EXISTS "external_url" text`;
  await sql`ALTER TABLE "social_creatives" ADD COLUMN IF NOT EXISTS "last_error" text`;
  await sql`CREATE INDEX IF NOT EXISTS "social_creatives_scheduled_idx" ON "social_creatives" ("scheduled_at")`;

  // Product deep-link slug + cached Pinterest analytics (P3 polish).
  await sql`ALTER TABLE "social_creatives" ADD COLUMN IF NOT EXISTS "product_slug" text`;
  await sql`ALTER TABLE "social_creatives" ADD COLUMN IF NOT EXISTS "metric_impressions" integer`;
  await sql`ALTER TABLE "social_creatives" ADD COLUMN IF NOT EXISTS "metric_saves" integer`;
  await sql`ALTER TABLE "social_creatives" ADD COLUMN IF NOT EXISTS "metric_pin_clicks" integer`;
  await sql`ALTER TABLE "social_creatives" ADD COLUMN IF NOT EXISTS "metric_outbound_clicks" integer`;
  await sql`ALTER TABLE "social_creatives" ADD COLUMN IF NOT EXISTS "metrics_updated_at" timestamptz`;

  // Generation queue (batch factory — P4).
  await sql`
    CREATE TABLE IF NOT EXISTS "social_jobs" (
      "id" serial PRIMARY KEY,
      "product_id" integer NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
      "preset" text NOT NULL,
      "platform" text NOT NULL DEFAULT 'generic',
      "quality" text NOT NULL DEFAULT 'medium',
      "extra" text,
      "status" text NOT NULL DEFAULT 'queued',
      "result_creative_id" integer,
      "error" text,
      "attempts" integer NOT NULL DEFAULT 0,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "processed_at" timestamptz
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS "social_jobs_status_idx" ON "social_jobs" ("status")`;
  await sql`CREATE INDEX IF NOT EXISTS "social_jobs_created_idx" ON "social_jobs" ("created_at")`;

  // OAuth token store (Pinterest auto-refresh).
  await sql`
    CREATE TABLE IF NOT EXISTS "social_tokens" (
      "platform" text PRIMARY KEY,
      "access_token" text NOT NULL,
      "refresh_token" text,
      "expires_at" timestamptz,
      "refresh_expires_at" timestamptz,
      "scopes" text,
      "account_id" text,
      "account_name" text,
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )
  `;

  // Seed the current PINTEREST_ACCESS_TOKEN into the DB (bootstrap).
  const accessToken = process.env.PINTEREST_ACCESS_TOKEN;
  const appSecret = process.env.PINTEREST_APP_SECRET;
  if (accessToken) {
    await sql`
      INSERT INTO "social_tokens" ("platform", "access_token", "expires_at", "updated_at")
      VALUES (
        'pinterest',
        ${accessToken},
        now() + interval '30 days',
        now()
      )
      ON CONFLICT ("platform") DO UPDATE SET
        "access_token" = EXCLUDED."access_token",
        "expires_at"   = COALESCE("social_tokens"."expires_at", now() + interval '30 days'),
        "updated_at"   = now()
    `;
    console.log("✓ PINTEREST_ACCESS_TOKEN seeded into social_tokens.");
    if (!appSecret) {
      console.warn("⚠ PINTEREST_APP_SECRET not set — auto-refresh won't work until you set it.");
    }
  } else {
    console.warn("⚠ PINTEREST_ACCESS_TOKEN not set — skipping social_tokens seed.");
  }

  console.log("✓ Social Studio schema applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

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

  // Source catalog image link — dedup key for the autonomous auto-pin drip.
  await sql`ALTER TABLE "social_creatives" ADD COLUMN IF NOT EXISTS "source_image_id" integer REFERENCES "product_images"("id") ON DELETE SET NULL`;
  await sql`CREATE INDEX IF NOT EXISTS "social_creatives_source_image_idx" ON "social_creatives" ("source_image_id")`;

  // Media type + source video — enables video pins and per-listing auto-pinning
  // (a listing's photos AND its video are all posted together).
  await sql`ALTER TABLE "social_creatives" ADD COLUMN IF NOT EXISTS "media_type" text NOT NULL DEFAULT 'image'`;
  await sql`ALTER TABLE "social_creatives" ADD COLUMN IF NOT EXISTS "video_url" text`;
  // Fast lookups for "is this product's video already pinned?" dedup + history.
  await sql`CREATE INDEX IF NOT EXISTS "social_creatives_media_type_idx" ON "social_creatives" ("media_type")`;

  // Retry counter — the auto-pin poison-pill guard gives up on an asset after
  // a capped number of failed attempts so it can't block the daily queue.
  await sql`ALTER TABLE "social_creatives" ADD COLUMN IF NOT EXISTS "attempts" integer NOT NULL DEFAULT 0`;

  // Per-pin SEO title — each pin of a listing gets a distinct keyword-varied
  // title to widen search coverage (falls back to product title when null).
  await sql`ALTER TABLE "social_creatives" ADD COLUMN IF NOT EXISTS "title" text`;

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
    // Bootstrap ONLY when no token row exists yet. We must never clobber an
    // existing row: the OAuth callback + refresh cron keep a fresher,
    // auto-rotated access token there, and overwriting it with a possibly-stale
    // env var would silently break publishing.
    await sql`
      INSERT INTO "social_tokens" ("platform", "access_token", "expires_at", "updated_at")
      VALUES (
        'pinterest',
        ${accessToken},
        now() + interval '30 days',
        now()
      )
      ON CONFLICT ("platform") DO NOTHING
    `;
    console.log("✓ PINTEREST_ACCESS_TOKEN bootstrapped into social_tokens (existing token preserved).");
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

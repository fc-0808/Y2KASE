/**
 * One-off, idempotent DDL for the page_views (visitor analytics) table.
 *
 * Mirrors the Drizzle schema in src/lib/db/schema.ts and the style of
 * apply-orders-schema.ts so we avoid drizzle-kit push's interactive TTY prompt.
 * Safe to re-run — uses CREATE TABLE IF NOT EXISTS and guarded ALTERs.
 *
 *   npm run db:analytics
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);

  await sql`
    CREATE TABLE IF NOT EXISTS "page_views" (
      "id" serial PRIMARY KEY,
      "visitor_id" text NOT NULL,
      "user_id" text,
      "path" text NOT NULL,
      "referrer" text,
      "ip" text,
      "country" text,
      "region" text,
      "city" text,
      "latitude" numeric(9, 6),
      "longitude" numeric(9, 6),
      "timezone" text,
      "user_agent" text,
      "device" text,
      "browser" text,
      "os" text,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )
  `;

  // user_id FK added separately so re-runs don't fail if it already exists.
  await sql`
    DO $$ BEGIN
      ALTER TABLE "page_views"
        ADD CONSTRAINT "page_views_user_fk"
        FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `;

  await sql`CREATE INDEX IF NOT EXISTS "page_views_created_idx" ON "page_views" ("created_at")`;
  await sql`CREATE INDEX IF NOT EXISTS "page_views_visitor_idx" ON "page_views" ("visitor_id")`;
  await sql`CREATE INDEX IF NOT EXISTS "page_views_path_idx" ON "page_views" ("path")`;
  await sql`CREATE INDEX IF NOT EXISTS "page_views_country_idx" ON "page_views" ("country")`;

  console.log("✓ Analytics (page_views) schema applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * One-off, idempotent DDL for the thumbnail-normalization review queue.
 * Mirrors the Drizzle schema (`thumbnail_proposals`). Safe to re-run.
 *
 *   npm run db:thumbnails
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);

  await sql`
    CREATE TABLE IF NOT EXISTS "thumbnail_proposals" (
      "id" serial PRIMARY KEY,
      "product_id" integer NOT NULL UNIQUE REFERENCES "products"("id") ON DELETE CASCADE,
      "status" text NOT NULL DEFAULT 'proposed',
      "proposal_url" text,
      "source_image_id" integer,
      "score" numeric(4,3),
      "category" text,
      "reason" text,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS "thumbnail_proposals_status_idx" ON "thumbnail_proposals" ("status")`;

  console.log("✓ thumbnail_proposals table + index applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

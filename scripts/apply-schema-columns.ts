/**
 * One-off, idempotent DDL for the new catalog columns.
 * Avoids drizzle-kit push's interactive TTY prompt. Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);

  await sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "product_type" text NOT NULL DEFAULT 'iphone_case'`;
  await sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "video_url" text`;
  await sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "source_folder" text`;
  await sql`ALTER TABLE "product_images" ADD COLUMN IF NOT EXISTS "style_tags" text[] NOT NULL DEFAULT '{}'`;
  await sql`ALTER TABLE "product_images" ADD COLUMN IF NOT EXISTS "source_filename" text`;

  console.log("✓ Schema columns applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

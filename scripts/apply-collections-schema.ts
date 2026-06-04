/**
 * One-off, idempotent DDL for the collections taxonomy.
 *
 * Creates the `collections` hierarchy table and the `product_collections`
 * many-to-many join. Mirrors the style of `apply-schema-columns.ts` so we avoid
 * drizzle-kit push's interactive TTY prompt. Safe to re-run.
 *
 *   npm run db:collections
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);

  await sql`
    CREATE TABLE IF NOT EXISTS "collections" (
      "id" serial PRIMARY KEY,
      "slug" text NOT NULL,
      "name" text NOT NULL,
      "description" text,
      "kind" text NOT NULL DEFAULT 'character',
      "parent_id" integer,
      "position" integer NOT NULL DEFAULT 0,
      "featured" boolean NOT NULL DEFAULT false,
      "status" text NOT NULL DEFAULT 'active',
      "image_url" text,
      "icon" text,
      "accent_color" text,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )
  `;

  // Self-referential FK (added separately so re-runs don't fail if it exists).
  await sql`
    DO $$ BEGIN
      ALTER TABLE "collections"
        ADD CONSTRAINT "collections_parent_fk"
        FOREIGN KEY ("parent_id") REFERENCES "collections"("id") ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `;

  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "collections_slug_idx" ON "collections" ("slug")`;
  await sql`CREATE INDEX IF NOT EXISTS "collections_parent_idx" ON "collections" ("parent_id")`;
  await sql`CREATE INDEX IF NOT EXISTS "collections_kind_idx" ON "collections" ("kind")`;
  await sql`CREATE INDEX IF NOT EXISTS "collections_status_idx" ON "collections" ("status")`;

  await sql`
    CREATE TABLE IF NOT EXISTS "product_collections" (
      "product_id" integer NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
      "collection_id" integer NOT NULL REFERENCES "collections"("id") ON DELETE CASCADE,
      "position" integer NOT NULL DEFAULT 0,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "product_collections_pk" ON "product_collections" ("product_id", "collection_id")`;
  await sql`CREATE INDEX IF NOT EXISTS "product_collections_collection_idx" ON "product_collections" ("collection_id")`;

  console.log("✓ Collections schema applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

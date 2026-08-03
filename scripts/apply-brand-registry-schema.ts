/**
 * Idempotent DDL for the operator-editable brand vocabulary.
 * Mirrors the Drizzle schema. Safe to re-run.
 *
 *   npm run db:brand-registry
 *
 * `aliases` turns a browse node into a classification term set, and `source`
 * separates the nodes source control owns from the ones an operator created —
 * only the latter may be deleted from the admin.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);

  await sql`ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "aliases" text[] NOT NULL DEFAULT '{}'`;
  await sql`ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'config'`;
  await sql`CREATE INDEX IF NOT EXISTS "collections_source_idx" ON "collections" ("source")`;

  console.log("✓ collections.aliases + collections.source applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

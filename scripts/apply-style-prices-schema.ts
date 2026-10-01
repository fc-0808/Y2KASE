/**
 * Per-listing canonical style prices.
 *
 *   npm run db:style-prices
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);
  await sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "style_prices" jsonb NOT NULL DEFAULT '{}'::jsonb`;
  console.log("✓ products.style_prices applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

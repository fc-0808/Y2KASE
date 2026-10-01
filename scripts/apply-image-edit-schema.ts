/**
 * Pristine URL kept the first time a gallery photo is cropped.
 *
 *   npm run db:image-edits
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);
  await sql`ALTER TABLE "product_images" ADD COLUMN IF NOT EXISTS "original_url" text`;
  console.log("✓ product_images.original_url applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Bulk-publish all draft products to active.
 * Run once to make products visible on the storefront.
 *
 *   npm run publish:drafts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const { products } = schema;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  const db = drizzle(neon(url), { schema });

  const updated = await db
    .update(products)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(products.status, "draft"))
    .returning({ id: products.id, title: products.title });

  console.log(`\nPublished ${updated.length} product(s):\n`);
  for (const p of updated) {
    console.log(`  #${p.id} — ${p.title}`);
  }
  console.log("\nDone. Refresh http://localhost:3000 to see your products.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

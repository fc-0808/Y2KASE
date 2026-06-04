/**
 * scripts/apply-variations.ts
 *
 *   npm run apply:variations
 *
 * Adds the standard phone-case variation axes to EVERY product:
 *   • iPhone Model — 12 choices (free, does not affect price)
 *   • Style        — 6 choices (drives price via the pricing master)
 *
 * Also resets each product's base `price` to the Excel "True Customer Price"
 * for the default style (Case Only), so listing cards show the correct
 * "from" price and the AI's guessed price is overridden.
 *
 * Idempotent: re-running replaces the option rows cleanly.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import {
  defaultPhoneCaseOptions,
  getBasePrice,
} from "../src/lib/pricing";

const { products, productOptions } = schema;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  const db = drizzle(neon(url), { schema });

  const all = await db
    .select({ id: products.id, currency: products.currency })
    .from(products);

  console.log(`Applying variations to ${all.length} product(s)...\n`);

  const optionDefs = defaultPhoneCaseOptions();
  let updated = 0;

  for (const product of all) {
    // Replace existing option axes for a clean, idempotent result.
    await db.delete(productOptions).where(eq(productOptions.productId, product.id));

    await db.insert(productOptions).values(
      optionDefs.map((opt, position) => ({
        productId: product.id,
        name: opt.name,
        position,
        values: opt.values,
      })),
    );

    // Base price = default style ("Case Only") in the product's currency.
    const base = getBasePrice(product.currency ?? "USD");
    await db
      .update(products)
      .set({ price: String(base), updatedAt: new Date() })
      .where(eq(products.id, product.id));

    updated++;
    if (updated % 10 === 0) console.log(`  ...${updated}/${all.length}`);
  }

  console.log(`\n✓ Applied Model + Style options and base pricing to ${updated} product(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

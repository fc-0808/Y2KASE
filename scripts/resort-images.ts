/**
 * scripts/resort-images.ts
 *
 *   npm run resort:images
 *
 * One-time fix for products ingested before the natural-sort fix landed.
 * Re-orders every product's images by their ORIGINAL filename using a
 * numeric-aware comparison, so `1, 2, 3, … 10, 11` lands in human order
 * instead of the old lexicographic `1, 10, 11, 2, 3`.
 *
 * Safe to re-run: it only rewrites `product_images.position`.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { compareFilenamesNatural } from "../src/lib/utils";

const { products, productImages } = schema;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const db = drizzle(neon(url), { schema });

  const all = await db.select({ id: products.id }).from(products);
  console.log(`Re-sorting images for ${all.length} product(s)...\n`);

  let changed = 0;
  for (const { id } of all) {
    const imgs = await db
      .select({
        id: productImages.id,
        position: productImages.position,
        sourceFilename: productImages.sourceFilename,
      })
      .from(productImages)
      .where(eq(productImages.productId, id));

    if (imgs.length < 2) continue;

    const sorted = [...imgs].sort((a, b) =>
      compareFilenamesNatural(a.sourceFilename, b.sourceFilename),
    );

    // Skip products whose order is already correct.
    const isSame = sorted.every((img, i) => img.id === imgs[i].id);
    if (isSame) continue;

    await Promise.all(
      sorted.map((img, position) =>
        db
          .update(productImages)
          .set({ position })
          .where(eq(productImages.id, img.id)),
      ),
    );
    changed++;
    if (changed % 10 === 0) console.log(`  ...${changed} updated`);
  }

  console.log(`\n✓ Re-sorted images for ${changed} product(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

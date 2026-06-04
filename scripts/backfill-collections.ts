/**
 * Auto-assign existing products to collections from their text signals.
 *
 *   npm run backfill:collections
 *
 * For every product, matches its tags / title / source folder against the
 * taxonomy `match` keywords (see collections-config.ts) and inserts the
 * resulting product_collections rows. Idempotent — re-running only adds missing
 * memberships and never removes manual assignments. Run AFTER seed:collections.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { inArray } from "drizzle-orm";
import { db } from "../src/lib/db";
import { products, collections, productCollections } from "../src/lib/db/schema";
import { matchCollectionSlugs } from "../src/lib/catalog/collections-config";

async function main() {
  const allCollections = await db.query.collections.findMany({
    columns: { id: true, slug: true },
  });
  if (allCollections.length === 0) {
    console.error("No collections found. Run `npm run seed:collections` first.");
    process.exit(1);
  }
  const idBySlug = new Map(allCollections.map((c) => [c.slug, c.id]));

  const rows = await db.query.products.findMany({
    columns: { id: true, title: true, tags: true, sourceFolder: true },
  });

  let assigned = 0;
  let touched = 0;

  for (const p of rows) {
    const slugs = matchCollectionSlugs({
      tags: p.tags,
      title: p.title,
      sourceFolder: p.sourceFolder,
    });
    if (slugs.length === 0) continue;

    const collectionIds = slugs
      .map((s) => idBySlug.get(s))
      .filter((x): x is number => typeof x === "number");
    if (collectionIds.length === 0) continue;

    touched += 1;
    for (const collectionId of collectionIds) {
      const res = await db
        .insert(productCollections)
        .values({ productId: p.id, collectionId })
        .onConflictDoNothing();
      // neon-http returns rowCount on the result; count best-effort.
      assigned += (res as { rowCount?: number }).rowCount ?? 1;
    }
    console.log(`  ✓ #${p.id} ${p.title} → ${slugs.join(", ")}`);
  }

  console.log(
    `\n✓ Backfill complete. ${touched} product(s) matched, ~${assigned} membership row(s) ensured.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

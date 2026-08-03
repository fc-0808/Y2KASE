/**
 * Idempotently sync the `collections` table from the config taxonomy.
 *
 *   npm run seed:collections
 *
 * Thin CLI over `applyCollectionTaxonomy` — the same reconciliation the admin
 * console's "Sync taxonomy" button runs, so the two can never drift. Safe to
 * re-run after editing src/lib/catalog/collections-config.ts; existing
 * membership in product_collections is never touched.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import {
  applyCollectionTaxonomy,
  diffCollectionTaxonomy,
} from "../src/lib/catalog/taxonomy-sync";

async function main() {
  const before = await diffCollectionTaxonomy();
  if (before.missing.length === 0 && before.outdated.length === 0) {
    console.log(`✓ Taxonomy already in sync (${before.total} collections).`);
    process.exit(0);
  }

  for (const node of before.missing) {
    console.log(`  + ${node.name} (${node.slug})`);
  }
  for (const node of before.outdated) {
    console.log(`  ~ ${node.name} (${node.slug})`);
  }

  const result = await applyCollectionTaxonomy();
  console.log(
    `\n✓ Synced ${result.total} collections — ${result.inserted} added, ${result.updated} refreshed.`,
  );
  console.log(
    "  Run `npm run backfill:collections` to assign existing products to any new node.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

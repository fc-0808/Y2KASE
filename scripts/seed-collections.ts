/**
 * Idempotently sync the `collections` table from the config taxonomy.
 *
 *   npm run seed:collections
 *
 * Upserts every node by slug (insert-or-update name/kind/art/featured), then a
 * second pass wires up `parent_id` and `position` from the tree. Safe to re-run
 * after editing src/lib/catalog/collections-config.ts; existing membership in
 * product_collections is never touched.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { collections } from "../src/lib/db/schema";
import {
  flattenTaxonomy,
  type FlatCollectionSeed,
} from "../src/lib/catalog/collections-config";

async function upsertNode(node: FlatCollectionSeed, position: number) {
  const existing = await db.query.collections.findFirst({
    where: eq(collections.slug, node.slug),
    columns: { id: true },
  });

  const values = {
    slug: node.slug,
    name: node.name,
    kind: node.kind,
    description: node.description ?? null,
    icon: node.icon ?? null,
    accentColor: node.accentColor ?? null,
    featured: Boolean(node.featured),
    position,
    status: "active" as const,
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(collections)
      .set(values)
      .where(eq(collections.id, existing.id));
    return existing.id;
  }
  const [row] = await db
    .insert(collections)
    .values(values)
    .returning({ id: collections.id });
  return row.id;
}

async function main() {
  const flat = flattenTaxonomy();

  // Pass 1: upsert every node so all ids exist before we link parents.
  const idBySlug = new Map<string, number>();
  let i = 0;
  for (const node of flat) {
    const id = await upsertNode(node, i++);
    idBySlug.set(node.slug, id);
    console.log(`  ✓ ${node.parentSlug ? "  ↳ " : ""}${node.name} (#${id})`);
  }

  // Pass 2: link parents.
  for (const node of flat) {
    const id = idBySlug.get(node.slug)!;
    const parentId = node.parentSlug ? idBySlug.get(node.parentSlug) ?? null : null;
    await db
      .update(collections)
      .set({ parentId })
      .where(eq(collections.id, id));
  }

  console.log(`\n✓ Seeded ${flat.length} collections.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

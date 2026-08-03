/**
 * One-off repair for the collection memberships deleted by the 2026-07-31
 * `audit:titles --apply` run.
 *
 * What went wrong: `refileProduct` treated the stored `brandName` /
 * `characterName` columns as authoritative on the brand axis, so it removed a
 * product from its character collection whenever the column disagreed. For the
 * 22 rows the title audit flags as `brand_conflict` — a case whose own title
 * says Cinnamoroll on a row whose column says Hello Kitty — the column was
 * precisely the untrustworthy input, and the delete took away the correct
 * membership. `brandAxisHold` in `collection-filing.ts` now refuses to act on
 * an uncorroborated classification, so this cannot recur.
 *
 * What this script does: re-inserts exactly the (product, collection) pairs
 * that run removed, transcribed from its output. Insert-only, on conflict do
 * nothing, so it is safe to run twice and cannot delete anything.
 *
 * It deliberately does NOT undo that run's additions. Some were correct, and an
 * extra collection costs a product nothing while a missing one makes it
 * unreachable. Use the "Filed in" list on the product page to prune.
 *
 *   npx tsx scripts/restore-refiled-collections.ts            # preview
 *   npx tsx scripts/restore-refiled-collections.ts --apply    # write
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, inArray } from "drizzle-orm";
import { db } from "../src/lib/db";
import { collections, productCollections, products } from "../src/lib/db/schema";
import { resolveRunMode } from "./lib/cli";

/** productId → the brand/character slugs the faulty run removed from it. */
const REMOVED: Record<number, string[]> = {
  5: ["miffy"],
  15: ["miffy"],
  57: ["my-melody"],
  66: ["cinnamoroll"],
  67: ["cinnamoroll"],
  69: ["my-melody"],
  72: ["tamagotchi"],
  79: ["tamagotchi"],
  82: ["sanrio", "my-melody"],
  83: ["tamagotchi"],
  87: ["tamagotchi"],
  91: ["tamagotchi"],
  97: ["my-melody"],
  100: ["tamagotchi"],
  101: ["tamagotchi"],
  102: ["kuromi"],
  103: ["sanrio", "hello-kitty"],
  104: ["tamagotchi"],
  106: ["kuromi"],
  107: ["miffy"],
  111: ["rilakkuma"],
  115: ["tamagotchi"],
  119: ["tamagotchi"],
  121: ["sanrio", "hello-kitty"],
  123: ["cinnamoroll"],
  124: ["tamagotchi"],
  125: ["my-melody"],
  127: ["my-melody"],
  130: ["kuromi"],
  132: ["my-melody"],
  65: ["kuromi"],
};

async function main() {
  const { apply } = resolveRunMode("Restore refiled collections");

  const wantedSlugs = [...new Set(Object.values(REMOVED).flat())];
  const collectionRows = await db
    .select({ id: collections.id, slug: collections.slug })
    .from(collections)
    .where(inArray(collections.slug, wantedSlugs));
  const idBySlug = new Map(collectionRows.map((row) => [row.slug, row.id]));

  const missingSlugs = wantedSlugs.filter((slug) => !idBySlug.has(slug));
  if (missingSlugs.length > 0) {
    console.log(
      `  ! Not in the database, skipped: ${missingSlugs.join(", ")}\n`,
    );
  }

  const productIds = Object.keys(REMOVED).map(Number);
  const titleById = new Map(
    (
      await db
        .select({ id: products.id, title: products.title })
        .from(products)
        .where(inArray(products.id, productIds))
    ).map((row) => [row.id, row.title]),
  );

  let restored = 0;
  let alreadyThere = 0;

  for (const productId of productIds) {
    const title = titleById.get(productId);
    if (!title) {
      console.log(`  #${productId} — product no longer exists, skipped`);
      continue;
    }

    const existing = new Set(
      (
        await db
          .select({ collectionId: productCollections.collectionId })
          .from(productCollections)
          .where(eq(productCollections.productId, productId))
      ).map((row) => row.collectionId),
    );

    const toAdd = REMOVED[productId]
      .map((slug) => ({ slug, id: idBySlug.get(slug) }))
      .filter(
        (entry): entry is { slug: string; id: number } =>
          entry.id !== undefined && !existing.has(entry.id),
      );

    if (toAdd.length === 0) {
      alreadyThere += 1;
      continue;
    }

    console.log(`  #${productId} ${title}`);
    console.log(`    + ${toAdd.map((entry) => entry.slug).join(", ")}`);

    if (apply) {
      await db
        .insert(productCollections)
        .values(
          toAdd.map((entry) => ({ productId, collectionId: entry.id })),
        )
        .onConflictDoNothing();
    }
    restored += 1;
  }

  console.log(
    `\n  Products restored : ${restored}` +
      `\n  Already correct   : ${alreadyThere}\n`,
  );
  if (!apply && restored > 0) {
    console.log("  Preview only. Re-run with --apply to write.\n");
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);

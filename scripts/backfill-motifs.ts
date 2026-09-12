/**
 * Backfill canonical motif families onto existing products, and file
 * unlicensed products into the Originals collection.
 *
 *   npm run backfill:motifs             # preview
 *   npm run backfill:motifs:apply       # write
 *
 * Classifies from listing text (title and source folder). Operator-
 * locked rows are never touched. Default writes only empty `motifs`; `--force`
 * overwrites unlocked rows. Originals membership is always reconciled.
 *
 * Preview is the default — see scripts/lib/cli.ts.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { products } from "../src/lib/db/schema";
import { mapWithConcurrency } from "../src/lib/catalog/concurrency";
import {
  classifyProductMotifs,
  type MotifFamilySlug,
} from "../src/lib/catalog/motifs";
import { isUnlicensedProduct } from "../src/lib/catalog/brands";
import { syncOriginalsMembership } from "../src/lib/catalog/brand-assignment";
import { hasFlag, resolveRunMode } from "./lib/cli";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

  const force = hasFlag("force");
  const mode = resolveRunMode("Motif / Originals backfill");
  const concurrency = Math.max(1, Number(process.env.INGEST_CONCURRENCY) || 8);

  const rows = await db.query.products.findMany({
    columns: {
      id: true,
      title: true,
      description: true,
      tags: true,
      sourceFolder: true,
      motifs: true,
      motifsLocked: true,
      brandName: true,
      characterName: true,
      status: true,
    },
    limit: 10_000,
  });

  const candidates = rows.filter((row) => {
    if (row.motifsLocked) return false;
    if (force) return true;
    return (row.motifs ?? []).length === 0;
  });

  const skippedLocked = rows.filter((row) => row.motifsLocked).length;
  console.log(
    `Classifying ${candidates.length} product(s) (${skippedLocked} locked, ${rows.length - candidates.length - skippedLocked} already filled). Filing Originals for ${rows.length}. Concurrency ${concurrency}.${force ? " Force-overwrite is on." : ""}\n`,
  );

  let filled = 0;
  let empty = 0;
  let unchanged = 0;
  let failed = 0;
  let originalsLinked = 0;
  let originalsRemoved = 0;

  await mapWithConcurrency(candidates, concurrency, async (row) => {
    try {
      const motifs = classifyProductMotifs({
        title: row.title,
        description: row.description,
        tags: row.tags,
        sourceFolder: row.sourceFolder,
      });
      const previous = (row.motifs ?? []) as MotifFamilySlug[];
      const same =
        previous.length === motifs.length &&
        previous.every((slug, i) => slug === motifs[i]);

      if (same) {
        unchanged += 1;
        return;
      }
      if (motifs.length === 0 && previous.length === 0) {
        empty += 1;
        console.log(`  · #${row.id} ${row.title.slice(0, 72)} — no motif signal`);
        return;
      }
      if (motifs.length === 0) {
        empty += 1;
        console.log(
          `  ${mode.verb("cleared", "would clear")} #${row.id} ${row.title.slice(0, 56)}`,
        );
      } else {
        filled += 1;
        console.log(
          `  ${mode.verb("updated", "would update")} #${row.id} ${row.title.slice(0, 56)} → ${motifs.join(", ")}`,
        );
      }
      if (!mode.apply) return;
      await db
        .update(products)
        .set({ motifs, updatedAt: new Date() })
        .where(eq(products.id, row.id));
    } catch (err) {
      failed += 1;
      console.error(
        `  ✗ #${row.id} ${err instanceof Error ? err.message : err}`,
      );
    }
  });

  console.log("\nReconciling Originals membership…");
  await mapWithConcurrency(rows, concurrency, async (row) => {
    if (!mode.apply) {
      return;
    }
    const result = await syncOriginalsMembership(
      row.id,
      row.brandName,
      row.characterName,
    );
    if (result.linked) originalsLinked += 1;
    if (result.removed) originalsRemoved += 1;
    if (result.unseeded) {
      console.log(
        "  ! Originals collection is not seeded — run `npm run seed:collections`.",
      );
    }
  });

  if (!mode.apply) {
    const wouldLink = rows.filter((row) =>
      isUnlicensedProduct(row.brandName, row.characterName),
    ).length;
    console.log(
      `  ${mode.verb("Would file", "Would file")} ~${wouldLink} unlicensed product(s) into Originals (exact count after apply).`,
    );
  }

  console.log(
    `\n${mode.verb("Wrote", "Would write")} ${filled} motif row(s). Unchanged ${unchanged}. No signal ${empty}. Failed ${failed}.`,
  );
  if (mode.apply) {
    console.log(
      `Originals: linked ${originalsLinked}, removed ${originalsRemoved}.`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

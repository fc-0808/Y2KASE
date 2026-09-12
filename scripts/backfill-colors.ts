/**
 * Backfill canonical color families onto existing products.
 *
 *   npm run backfill:colors             # preview
 *   npm run backfill:colors:apply       # write
 *
 * Classifies from listing text (title, description, tags, folder, materials)
 * plus a Sharp histogram of the hero thumbnail. Operator-locked rows are
 * never touched. Default writes only empty `colors`; `--force` overwrites
 * unlocked rows that already have a classification (use after improving
 * the recogniser).
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
  classifyProductColors,
  mergeColorClassifications,
  type ColorFamilySlug,
} from "../src/lib/catalog/colors";
import { extractColorsFromImageUrl } from "../src/lib/catalog/color-extract";
import { hasFlag, resolveRunMode } from "./lib/cli";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

  const force = hasFlag("force");
  const mode = resolveRunMode("Color backfill");
  const concurrency = Math.max(1, Number(process.env.INGEST_CONCURRENCY) || 6);

  const rows = await db.query.products.findMany({
    columns: {
      id: true,
      title: true,
      description: true,
      tags: true,
      materials: true,
      sourceFolder: true,
      colors: true,
      colorsLocked: true,
      status: true,
    },
    with: {
      images: {
        columns: { url: true, position: true },
        orderBy: (img, { asc }) => asc(img.position),
        limit: 1,
      },
    },
    limit: 10_000,
  });

  const candidates = rows.filter((row) => {
    if (row.colorsLocked) return false;
    if (force) return true;
    return (row.colors ?? []).length === 0;
  });

  const skippedLocked = rows.filter((row) => row.colorsLocked).length;
  console.log(
    `Classifying ${candidates.length} product(s) (${skippedLocked} locked, ${rows.length - candidates.length - skippedLocked} already filled). Concurrency ${concurrency}.${force ? " Force-overwrite is on." : ""}\n`,
  );

  let filled = 0;
  let empty = 0;
  let unchanged = 0;
  let failed = 0;

  await mapWithConcurrency(candidates, concurrency, async (row) => {
    try {
      const text = classifyProductColors({
        title: row.title,
        description: row.description,
        tags: row.tags,
        materials: row.materials,
        sourceFolder: row.sourceFolder,
      });
      const pixels = row.images[0]?.url
        ? await extractColorsFromImageUrl(row.images[0].url)
        : [];
      const colors = mergeColorClassifications(text, pixels);
      const previous = (row.colors ?? []) as ColorFamilySlug[];
      const same =
        previous.length === colors.length &&
        previous.every((slug, i) => slug === colors[i]);

      if (same) {
        unchanged += 1;
        return;
      }
      if (colors.length === 0) {
        empty += 1;
        console.log(`  · #${row.id} ${row.title.slice(0, 72)} — no signal`);
        return;
      }

      filled += 1;
      console.log(
        `  ${mode.verb("updated", "would update")} #${row.id} ${row.title.slice(0, 56)} → ${colors.join(", ")}`,
      );
      if (!mode.apply) return;
      await db
        .update(products)
        .set({ colors, updatedAt: new Date() })
        .where(eq(products.id, row.id));
    } catch (err) {
      failed += 1;
      console.error(
        `  ✗ #${row.id} ${err instanceof Error ? err.message : err}`,
      );
    }
  });

  console.log(
    `\n${mode.verb("Wrote", "Would write")} ${filled}. Unchanged ${unchanged}. No signal ${empty}. Failed ${failed}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

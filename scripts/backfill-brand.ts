/**
 * Backfill / audit brand classification across the EXISTING catalogue,
 * without re-uploading any images.
 *
 *   npm run backfill:brand             # preview: classify unclassified products
 *   npm run backfill:brand:apply       # …and write the result
 *   npm run backfill:brand:refresh     # preview: reclassify everything
 *   npm run backfill:brand:refresh:apply
 *
 * The default mode only touches rows that do not yet have brand metadata.
 * `--refresh` re-evaluates all rows and is intended for when the classifier has
 * materially improved. Both modes are idempotent and safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, isNull, or } from "drizzle-orm";
import { db } from "../src/lib/db";
import { products } from "../src/lib/db/schema";
import {
  classifyCharacterBrand,
  visionBrandIsAuthoritative,
} from "../src/lib/ai";
import { classifyBrandContext } from "../src/lib/catalog/brands";
import { applyBrandAssignment } from "../src/lib/catalog/brand-assignment";
import { mapWithConcurrency } from "../src/lib/catalog/concurrency";
import { hasFlag, resolveRunMode } from "./lib/cli";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

  const refresh = hasFlag("refresh");
  const mode = resolveRunMode(refresh ? "brand refresh" : "brand backfill");
  const dryRun = mode.preview;
  const concurrency = Math.max(1, Number(process.env.INGEST_CONCURRENCY) || 4);

  const rows = await db.query.products.findMany({
    columns: {
      id: true,
      title: true,
      sourceFolder: true,
      brandName: true,
      characterName: true,
      brandConfidence: true,
      brandEvidence: true,
    },
    with: {
      images: {
        columns: { url: true, position: true },
        orderBy: (img, { asc }) => asc(img.position),
        limit: 4,
      },
    },
    where: refresh
      ? undefined
      : or(isNull(products.brandName), eq(products.brandName, "")),
    limit: 10000,
  });

  console.log(
    `brand backfill — ${dryRun ? "PREVIEW" : "APPLY"}: ${dryRun ? "nothing will be written" : "changes will be committed"}.`,
  );
  console.log(
    `Scanning ${rows.length} product(s) for brand metadata (concurrency ${concurrency}).\n`,
  );

  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  let weak = 0;

  await mapWithConcurrency(rows, concurrency, async (row) => {
    const existing = {
      brand: row.brandName,
      character: row.characterName,
      confidence: row.brandConfidence,
      evidence: row.brandEvidence ?? [],
    };

    const imageUrls = row.images.map((img) => img.url);
    if (imageUrls.length === 0) {
      failed++;
      console.log(`  ? #${row.id} no images available`);
      return;
    }

    const textParts = [row.title, row.sourceFolder ?? ""].filter(
      (v): v is string => Boolean(v),
    );
    const classification = classifyBrandContext(textParts);
    const imageClassification = await classifyCharacterBrand(imageUrls, console.log);
    const finalClassification = visionBrandIsAuthoritative(imageClassification)
      ? imageClassification
      : classification;

    if (finalClassification.confidence === "none" || !finalClassification.brand) {
      failed++;
      console.log(`  ? #${row.id} no reliable brand found`);
      return;
    }

    if (finalClassification.confidence === "low") weak++;

    const changed =
      existing.brand !== finalClassification.brand ||
      existing.character !== finalClassification.character ||
      existing.confidence !== finalClassification.confidence ||
      JSON.stringify(existing.evidence) !==
        JSON.stringify(finalClassification.evidence);

    if (!changed) {
      unchanged++;
      return;
    }

    updated++;
    console.log(
      `  ${dryRun ? "would update" : "✓"} #${row.id} brand=${finalClassification.brand} character=${finalClassification.character ?? "null"} confidence=${finalClassification.confidence}`,
    );

    if (dryRun) return;

    // Writing through the shared assignment core re-files the product's brand
    // and character collections too, so a backfill can't leave the browse tree
    // describing the classification it just replaced.
    const sync = await applyBrandAssignment(row.id, {
      brandId: finalClassification.brandId,
      brandName: finalClassification.brand,
      characterId: finalClassification.characterId,
      characterName: finalClassification.character,
      confidence: finalClassification.confidence,
      evidence: finalClassification.evidence,
    });
    if (sync.unseeded.length > 0) {
      console.log(
        `      ! collections not seeded: ${sync.unseeded.join(", ")} — run npm run seed:collections`,
      );
    }
  });

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ${dryRun ? "PREVIEW — no changes written" : "Done."}
  Updated: ${updated}
  Unchanged: ${unchanged}
  Low-confidence matches: ${weak}
  No reliable brand: ${failed}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${dryRun ? "\n  Re-run with `npm run backfill:brand:apply` to commit.\n" : ""}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

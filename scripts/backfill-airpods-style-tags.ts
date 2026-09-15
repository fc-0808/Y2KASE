/**
 * Re-run vision Style tagging for AirPods cases.
 *
 *   npm run backfill:airpods-style-tags          # preview
 *   npm run backfill:airpods-style-tags:apply    # write
 *
 * Photos ingested before the AirPods Style axis (or classified with the
 * phone-case prompt) are stored as universal — every pill in the media editor
 * stays inactive. This pass loads each photo from R2, asks the same vision
 * classifier ingest uses, and writes at most one of Case + Charm / Case Only /
 * Charm Only.
 *
 * Default: only images that currently have no style tag. `--force` re-tags
 * every AirPods photo. `--limit N` / `--id <productId>` bound a trial run.
 *
 * Preview is the default — see scripts/lib/cli.ts.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { productImages } from "../src/lib/db/schema";
import { AIRPODS_STYLES } from "../src/lib/pricing";
import { offeredPriceValues } from "../src/lib/catalog/offered-options";
import { classifyStoredImageStyles } from "../src/lib/catalog/style-tag-stored";
import { hasFlag, readCount, resolveRunMode } from "./lib/cli";

function describe(tags: readonly string[]): string {
  return tags.length === 0 ? "universal" : tags[0]!;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  if (!process.env.VISION_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error("VISION_API_KEY (or OPENAI_API_KEY) is not set.");
  }

  const force = hasFlag("force");
  const limit = readCount("limit");
  const onlyId = readCount("id");
  const mode = resolveRunMode("AirPods style-tag backfill");

  const rows = await db.query.products.findMany({
    columns: { id: true, slug: true, title: true, productType: true },
    with: {
      images: {
        columns: { id: true, url: true, styleTags: true, sourceFilename: true },
        orderBy: (img, { asc }) => asc(img.position),
      },
      options: { columns: { name: true, values: true } },
    },
    limit: 20_000,
  });

  const cases = rows.filter((row) => {
    if (row.productType !== "airpod_case") return false;
    if (onlyId != null && row.id !== onlyId) return false;
    return true;
  });

  const work = [];
  for (const product of cases) {
    const offered = offeredPriceValues(product.productType, product.options);
    const styles = offered.length > 0 ? offered : [...AIRPODS_STYLES];
    const images = force
      ? product.images
      : product.images.filter((img) => (img.styleTags ?? []).length === 0);
    if (images.length === 0) continue;
    work.push({ product, styles, images });
  }

  const bounded = limit ? work.slice(0, limit) : work;
  console.log(
    `AirPods cases: ${cases.length}. ` +
      `${bounded.length} product(s) with untagged (or --force) photos` +
      `${force ? " (force)" : ""}${onlyId != null ? ` (id ${onlyId})` : ""}.\n`,
  );

  let productsTouched = 0;
  let imagesTagged = 0;
  let imagesUniversal = 0;
  let imagesFailed = 0;
  const skipped = cases.length - work.length;

  for (const { product, styles, images } of bounded) {
    const classified = await classifyStoredImageStyles(images, {
      productType: "airpod_case",
      offeredStyles: styles,
    });
    imagesFailed += classified.failures.length;
    if (classified.failures.length > 0) {
      console.log(
        `  #${product.id} ${product.slug}  ${classified.failures.length} photo(s) unreadable`,
      );
      for (const failure of classified.failures) {
        console.log(`    skip  ${failure.kind}: ${failure.reason}`);
      }
    }

    const classifiedIds = Object.keys(classified.tagsById);
    if (classifiedIds.length === 0) continue;

    productsTouched += 1;
    console.log(`  #${product.id} ${product.slug}`);
    for (const img of images) {
      const tags = classified.tagsById[img.id];
      if (!tags) continue;
      if (tags.length > 0) imagesTagged += 1;
      else imagesUniversal += 1;
      const name = img.sourceFilename ?? `image-${img.id}`;
      console.log(
        `    ${mode.verb("tagged", "would tag")}  ${name}: ${describe(tags)}`,
      );
      if (mode.preview) continue;
      await db
        .update(productImages)
        .set({ styleTags: tags })
        .where(eq(productImages.id, img.id));
    }
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ${mode.preview ? "PREVIEW — no changes written" : "Done."}
  Products ${mode.verb("updated", "to update")} : ${productsTouched}
  Photos tagged              : ${imagesTagged}
  Photos left universal      : ${imagesUniversal}
  Photos unreadable          : ${imagesFailed}
  Products already tagged    : ${skipped}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${mode.preview ? "\n  Re-run with --apply (or `npm run backfill:airpods-style-tags:apply`) to commit.\n" : ""}
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

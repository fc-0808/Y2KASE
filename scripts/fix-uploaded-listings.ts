/**
 * Correct the iPhone cases uploaded on 2026-09-22:
 *   - drop the iPhone 13/14 generation (14/13, 14 Pro, 14 Pro Max)
 *   - ask vision whether a grip is actually in the photos, and turn Includes
 *     grip off when it is not
 *
 *   npx tsx scripts/fix-uploaded-listings.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq, gte } from "drizzle-orm";
import { db } from "../src/lib/db";
import { productImages, productOptions, products } from "../src/lib/db/schema";
import { verifyProductGrip } from "../src/lib/ai";
import { mapWithConcurrency } from "../src/lib/catalog/concurrency";
import {
  IPHONE_GENERATIONS,
  MODEL_OPTION_NAME,
  STYLE_OPTION_NAME,
  addonsFromStyles,
  normalizeImageStyleTags,
  stylesForAddons,
} from "../src/lib/pricing";

const UPLOADED_AFTER = new Date("2026-09-22T00:00:00.000Z");
const OFF_BY_DEFAULT = new Set(
  IPHONE_GENERATIONS.find((g) => g.id === "14")?.models ?? [],
);

function withoutGripTag(tag: string): string {
  if (tag === "Case + Grip + Charm") return "Case + Charm";
  if (tag === "Case + Grip" || tag === "Grip Only") return "Case Only";
  return tag;
}

async function main() {
  const rows = await db.query.products.findMany({
    where: and(
      eq(products.productType, "iphone_case"),
      gte(products.id, 324),
      gte(products.createdAt, UPLOADED_AFTER),
    ),
    columns: { id: true, title: true },
    with: {
      images: {
        columns: { id: true, url: true, position: true, styleTags: true },
        orderBy: (img, { asc }) => asc(img.position),
      },
      options: {
        columns: { id: true, name: true, values: true },
      },
    },
  });

  console.log(`Reviewing ${rows.length} uploaded iPhone cases\n`);

  let modelsUpdated = 0;
  let gripOff = 0;
  let gripOn = 0;
  let gripUnknown = 0;

  await mapWithConcurrency(rows, 3, async (product, index) => {
    const label = `[${index + 1}/${rows.length}] #${product.id}`;
    const modelOption = product.options.find((o) => o.name === MODEL_OPTION_NAME);
    const styleOption = product.options.find((o) => o.name === STYLE_OPTION_NAME);

    if (modelOption?.values.some((v) => OFF_BY_DEFAULT.has(v))) {
      await db
        .update(productOptions)
        .set({
          values: modelOption.values.filter((v) => !OFF_BY_DEFAULT.has(v)),
        })
        .where(eq(productOptions.id, modelOption.id));
      modelsUpdated++;
      console.log(`${label} — iPhone 13/14 generation off`);
    }

    const urls = product.images.map((img) => img.url).filter(Boolean);
    const verdict = await verifyProductGrip(urls);
    if (!verdict) {
      gripUnknown++;
      console.log(`${label} — grip check unavailable, left as-is`);
      return;
    }
    if (verdict.grip) {
      gripOn++;
      console.log(`${label} — grip kept (${verdict.evidence})`);
      return;
    }

    const currentStyles = styleOption?.values ?? [];
    if (!addonsFromStyles(currentStyles).hasGrip) {
      gripOff++;
      console.log(`${label} — already no grip`);
      return;
    }

    const nextStyles = stylesForAddons({
      hasGrip: false,
      hasCharm: addonsFromStyles(currentStyles).hasCharm,
    });
    if (styleOption) {
      await db
        .update(productOptions)
        .set({ values: nextStyles })
        .where(eq(productOptions.id, styleOption.id));
    }
    for (const image of product.images) {
      const nextTags = normalizeImageStyleTags(
        (image.styleTags ?? []).map(withoutGripTag),
        nextStyles,
      );
      const prev = image.styleTags ?? [];
      if (nextTags.length === prev.length && nextTags[0] === prev[0]) continue;
      await db
        .update(productImages)
        .set({ styleTags: nextTags })
        .where(eq(productImages.id, image.id));
    }
    gripOff++;
    console.log(`${label} — Includes grip off — ${product.title}`);
  });

  console.log(
    `\nModels updated: ${modelsUpdated}  Grip off: ${gripOff}  Grip kept: ${gripOn}  Unchecked: ${gripUnknown}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * scripts/normalize-style-tags.ts
 *
 *   npm run normalize:style-tags          # preview
 *   npm run normalize:style-tags:apply    # commit
 *
 * Collapses `product_images.style_tags` onto the "one photo, one variation"
 * invariant — see "Per-image style tagging" in `src/lib/pricing`.
 *
 * The vision classifier used to be prompted to tag inclusively, so a photo of a
 * case with a grip and a charm was written as all three bundles it could
 * plausibly illustrate. The storefront resolves a style to its photo with the
 * first image carrying that tag, so those rows make several variations share
 * one representative shot. Rows are also re-checked against the styles their
 * product still offers, clearing tags left dangling by a later variation edit.
 *
 * The admin editors and every write path now normalize on their own, so this is
 * purely a catch-up pass for rows nobody has re-saved since. Idempotent: a
 * second run reports zero changes.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { productImages } from "../src/lib/db/schema";
import {
  STYLE_OPTION_NAME,
  orderStyles,
  normalizeImageStyleTags,
  imageStyleTagsAreCanonical,
} from "../src/lib/pricing";
import { resolveRunMode } from "./lib/cli";

/** How a photo's tags read once collapsed, for the preview log. */
function describe(tags: readonly string[]): string {
  return tags.length === 0 ? "universal" : tags.join(" + ");
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const mode = resolveRunMode("normalize-style-tags");

  const all = await db.query.products.findMany({
    columns: { id: true, title: true, productType: true },
    with: {
      images: {
        columns: { id: true, styleTags: true, sourceFilename: true },
        orderBy: (img, { asc }) => asc(img.position),
      },
      options: { columns: { name: true, values: true } },
    },
  });

  let productsTouched = 0;
  let imagesChanged = 0;
  let multiTagged = 0;
  let dangling = 0;

  for (const product of all) {
    // Non-cases have no Style axis, so any tag on their photos is stale.
    const offered =
      product.productType === "iphone_case"
        ? orderStyles(
            product.options.find((o) => o.name === STYLE_OPTION_NAME)?.values ??
              [],
          )
        : [];
    const styles = offered.length > 0 ? offered : ["Case Only"];

    const stale = product.images.filter(
      (img) => !imageStyleTagsAreCanonical(img.styleTags, styles),
    );
    if (stale.length === 0) continue;

    productsTouched += 1;
    console.log(`#${product.id} ${product.title}`);

    for (const img of stale) {
      const before = img.styleTags ?? [];
      const after = normalizeImageStyleTags(before, styles);
      if (before.length > 1) multiTagged += 1;
      else dangling += 1;
      imagesChanged += 1;

      console.log(
        `  ${mode.verb("normalized", "would normalize")} ` +
          `${img.sourceFilename ?? `image #${img.id}`}: ` +
          `${describe(before)} → ${describe(after)}`,
      );

      if (mode.apply) {
        await db
          .update(productImages)
          .set({ styleTags: after })
          .where(eq(productImages.id, img.id));
      }
    }
  }

  console.log(
    `\n${mode.verb("Normalized", "Would normalize")} ${imagesChanged} image(s) ` +
      `across ${productsTouched} product(s) — ` +
      `${multiTagged} multi-tagged, ${dangling} no longer offered.`,
  );
  if (mode.preview && imagesChanged > 0) {
    console.log("Re-run with `npm run normalize:style-tags:apply` to commit.\n");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

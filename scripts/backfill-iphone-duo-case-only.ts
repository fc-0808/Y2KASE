/**
 * Limit every iPhone Duo listing to the Case Only style.
 *
 *   npx tsx scripts/backfill-iphone-duo-case-only.ts
 *   npx tsx scripts/backfill-iphone-duo-case-only.ts --apply
 *
 * Preview is the default — see scripts/lib/cli.ts.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { productOptions, products } from "../src/lib/db/schema";
import {
  DEFAULT_STYLE,
  STYLE_OPTION_NAME,
  getBasePrice,
} from "../src/lib/pricing";
import { resolveRunMode } from "./lib/cli";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const mode = resolveRunMode("iPhone Duo Case Only");

  const rows = await db.query.products.findMany({
    columns: {
      id: true,
      slug: true,
      currency: true,
      price: true,
      productType: true,
    },
    with: {
      options: {
        columns: { id: true, name: true, values: true },
      },
    },
    limit: 20_000,
  });

  const cases = rows.filter((row) => row.productType === "iphone_duo_case");
  console.log(`Found ${cases.length} iPhone Duo case(s).\n`);

  let updated = 0;
  let already = 0;

  for (const product of cases) {
    const style = product.options.find(
      (option) => option.name === STYLE_OPTION_NAME,
    );
    const current = style?.values ?? [];
    const price = getBasePrice(product.currency).toFixed(2);
    const stylesAlready =
      current.length === 1 && current[0] === DEFAULT_STYLE;
    const priceAlready = product.price === price;
    if (stylesAlready && priceAlready && style) {
      already++;
      continue;
    }

    updated++;
    console.log(
      `  #${product.id} ${product.slug}\n` +
        `    styles  ${current.join(" | ") || "(none)"} → ${DEFAULT_STYLE}\n` +
        `    price   ${product.price} → ${price} ${product.currency}`,
    );
    if (mode.preview) continue;

    if (!style) {
      await db.insert(productOptions).values({
        productId: product.id,
        name: STYLE_OPTION_NAME,
        position: 0,
        values: [DEFAULT_STYLE],
      });
    } else if (!stylesAlready) {
      await db
        .update(productOptions)
        .set({ values: [DEFAULT_STYLE] })
        .where(
          and(
            eq(productOptions.id, style.id),
            eq(productOptions.productId, product.id),
          ),
        );
    }

    await db
      .update(products)
      .set({
        price,
        stylePrices: {},
        customStyles: [],
        containsMultipleProducts: false,
        updatedAt: new Date(),
      })
      .where(eq(products.id, product.id));
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ${mode.preview ? "PREVIEW — no changes written" : "Done."}
  Already Case Only      : ${already}
  Listings ${mode.verb("updated", "to update")} : ${updated}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

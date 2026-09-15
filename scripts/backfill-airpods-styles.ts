/**
 * Give every AirPods case the Case / Case + Charm / Charm Only style axis.
 *
 *   npm run backfill:airpods-styles          # preview
 *   npm run backfill:airpods-styles:apply    # write
 *
 * Ingest of an `airpod_case` now writes this axis automatically. Listings
 * uploaded before that change only have "AirPods Model", so the products
 * table and the PDP have nothing to price. This backfill inserts the Style
 * option (or rewrites a partial one onto the canonical trio) and snaps
 * `products.price` to Case Only from PRICE_TABLE (same entry price as iPhone).
 *
 * Preview is the default — see scripts/lib/cli.ts.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { productOptions, products } from "../src/lib/db/schema";
import {
  AIRPODS_STYLES,
  STYLE_OPTION_NAME,
  getAirpodsBasePrice,
} from "../src/lib/pricing";
import { resolveRunMode } from "./lib/cli";

function sameStyles(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((style, i) => style === b[i]);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const mode = resolveRunMode("AirPods style axis backfill");
  const canonical = [...AIRPODS_STYLES];

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
        columns: { id: true, name: true, values: true, position: true },
        orderBy: (opt, { asc }) => asc(opt.position),
      },
    },
    limit: 20_000,
  });

  const cases = rows.filter((row) => row.productType === "airpod_case");
  console.log(
    `Scanned ${rows.length} product(s); ${cases.length} AirPods case(s).\n`,
  );

  let created = 0;
  let rewritten = 0;
  let priced = 0;
  let already = 0;

  for (const product of cases) {
    const styleOpt = product.options.find(
      (option) => option.name === STYLE_OPTION_NAME,
    );
    const current = styleOpt?.values ?? [];
    const stylesChanged = !styleOpt || !sameStyles(current, canonical);
    const nextPrice = String(getAirpodsBasePrice(product.currency ?? "USD"));
    const priceChanged = product.price !== nextPrice;

    if (!stylesChanged && !priceChanged) {
      already++;
      continue;
    }

    if (!styleOpt) created++;
    else if (stylesChanged) rewritten++;
    if (priceChanged) priced++;

    console.log(
      `  #${product.id} ${product.slug}` +
        `${!styleOpt ? "  (create Style)" : stylesChanged ? "  (rewrite Style)" : ""}` +
        `${priceChanged ? `  price ${product.price} → ${nextPrice}` : ""}`,
    );
    if (stylesChanged) {
      console.log(`    styles  ${current.join(", ") || "(none)"}`);
      console.log(`    after   ${canonical.join(", ")}`);
    }

    if (mode.preview) continue;

    if (!styleOpt) {
      await db.insert(productOptions).values({
        productId: product.id,
        name: STYLE_OPTION_NAME,
        position: product.options.length,
        values: canonical,
      });
    } else if (stylesChanged) {
      await db
        .update(productOptions)
        .set({ values: canonical })
        .where(
          and(
            eq(productOptions.id, styleOpt.id),
            eq(productOptions.productId, product.id),
          ),
        );
    }

    if (priceChanged) {
      await db
        .update(products)
        .set({ price: nextPrice, updatedAt: new Date() })
        .where(eq(products.id, product.id));
    } else {
      await db
        .update(products)
        .set({ updatedAt: new Date() })
        .where(eq(products.id, product.id));
    }
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ${mode.preview ? "PREVIEW — no changes written" : "Done."}
  Already current        : ${already}
  Style axes ${mode.verb("created", "to create")}  : ${created}
  Style lists ${mode.verb("rewritten", "to rewrite")} : ${rewritten}
  Base prices ${mode.verb("updated", "to update")} : ${priced}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${mode.preview ? "\n  Re-run with --apply (or `npm run backfill:airpods-styles:apply`) to commit.\n" : ""}
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

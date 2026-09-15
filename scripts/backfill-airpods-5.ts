/**
 * Normalize every AirPods case "AirPods Model" axis onto the live mould list.
 *
 *   npx tsx scripts/backfill-airpods-5.ts          # preview
 *   npx tsx scripts/backfill-airpods-5.ts --apply  # write
 *
 * The picker reads each product's stored option, not the master list in
 * `src/lib/catalog/airpods.ts`. This rewrite:
 *   • folds `"AirPods 4"` / `"AirPods 5"` onto `"AirPods 4 / 5"`
 *   • drops moulds we do not sell (currently AirPods Max)
 *
 * Additive on the shared 4/5 mould only: a Pro-only listing stays Pro-only.
 * Titles are left alone: AirPods coverage is not part of the listing-title
 * contract (that phrase is iPhone).
 *
 * Preview is the default — see scripts/lib/cli.ts.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { productOptions, products } from "../src/lib/db/schema";
import {
  AIRPODS_MODEL_OPTION_NAME,
  defaultAirpodsModels,
  extendAirpodsSharedFits,
} from "../src/lib/catalog/airpods";
import { resolveRunMode } from "./lib/cli";

function sameModels(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((model, i) => model === b[i]);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const mode = resolveRunMode("AirPods 4 / 5 shared-mould backfill");

  const rows = await db.query.products.findMany({
    columns: {
      id: true,
      slug: true,
      title: true,
      status: true,
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

  let extended = 0;
  let created = 0;
  let already = 0;

  for (const product of cases) {
    const modelOpt = product.options.find(
      (option) => option.name === AIRPODS_MODEL_OPTION_NAME,
    );
    const current = modelOpt?.values ?? [];
    let next =
      current.length > 0
        ? extendAirpodsSharedFits(current)
        : defaultAirpodsModels();
    // A row whose every stored value was retired (Max-only, historically)
    // must not lose the picker — restore the live lineup.
    if (next.length === 0) next = defaultAirpodsModels();
    const modelsChanged = !modelOpt || !sameModels(current, next);

    if (!modelsChanged) {
      already++;
      continue;
    }

    if (!modelOpt) created++;
    else extended++;
    console.log(
      `  #${product.id} ${product.slug}` +
        `  ${current.length || 0} → ${next.length}` +
        `${!modelOpt ? "  (created axis)" : ""}`,
    );
    console.log(`    before  ${current.join(", ") || "(none)"}`);
    console.log(`    after   ${next.join(", ")}`);

    if (mode.preview) continue;

    if (!modelOpt) {
      await db.insert(productOptions).values({
        productId: product.id,
        name: AIRPODS_MODEL_OPTION_NAME,
        position: 0,
        values: next,
      });
    } else {
      await db
        .update(productOptions)
        .set({ values: next })
        .where(
          and(
            eq(productOptions.id, modelOpt.id),
            eq(productOptions.productId, product.id),
          ),
        );
    }

    await db
      .update(products)
      .set({ updatedAt: new Date() })
      .where(eq(products.id, product.id));
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ${mode.preview ? "PREVIEW — no changes written" : "Done."}
  Already current        : ${already}
  Model axes ${mode.verb("created", "to create")}  : ${created}
  Model lists ${mode.verb("rewritten", "to rewrite")} : ${extended}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${mode.preview ? "\n  Re-run with --apply (or `npm run backfill:airpods-5:apply`) to commit.\n" : ""}
  Product pages ISR for an hour; a deploy (or waiting out the window) picks
  the AirPods 4 / 5 chip up on the live storefront.
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

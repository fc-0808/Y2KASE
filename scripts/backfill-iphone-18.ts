/**
 * Add iPhone 18 Pro and iPhone 18 Pro Max to every iPhone-case listing.
 *
 *   npm run backfill:iphone-18          # preview
 *   npm run backfill:iphone-18:apply    # write
 *
 * The picker reads each product's stored "iPhone Model" option, not the
 * master list in `pricing.ts`. Shipping the new SKUs in code without this
 * backfill would leave every existing listing on 13–17.
 *
 * Additive on purpose: a mould the operator already narrowed (e.g. 15→17)
 * keeps that range and gains 18 Pro / 18 Pro Max. Titles are then repaired
 * from the new facts so the coverage phrase cannot advertise a generation
 * the option axis does not sell — and cannot omit the one it just gained.
 *
 * Preview is the default — see scripts/lib/cli.ts.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { productOptions, products } from "../src/lib/db/schema";
import {
  MODEL_OPTION_NAME,
  defaultModels,
  extendModelsWithGeneration,
} from "../src/lib/pricing";
import { MAGSAFE_TAG } from "../src/lib/catalog/magsafe";
import {
  listingIp,
  repairListingTitle,
  type ListingTitleFacts,
} from "../src/lib/catalog/listing-title";
import { resolveRunMode } from "./lib/cli";

/** The generation this launch adds. Keep in lockstep with IPHONE_GENERATIONS. */
const LAUNCH_GENERATION_ID = "18";

function sameModels(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((model, i) => model === b[i]);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const mode = resolveRunMode("iPhone 18 Pro / Pro Max backfill");

  const rows = await db.query.products.findMany({
    columns: {
      id: true,
      slug: true,
      title: true,
      status: true,
      tags: true,
      sourceFolder: true,
      productType: true,
      brandName: true,
      characterName: true,
    },
    with: {
      options: {
        columns: { id: true, name: true, values: true, position: true },
        orderBy: (opt, { asc }) => asc(opt.position),
      },
    },
    limit: 20_000,
  });

  const cases = rows.filter((row) => row.productType === "iphone_case");
  console.log(
    `Scanned ${rows.length} product(s); ${cases.length} iPhone case(s).\n`,
  );

  let extended = 0;
  let created = 0;
  let already = 0;
  let titles = 0;

  for (const product of cases) {
    const modelOpt = product.options.find(
      (option) => option.name === MODEL_OPTION_NAME,
    );
    const current = modelOpt?.values ?? [];
    const next = extendModelsWithGeneration(
      current.length > 0 ? current : defaultModels(),
      LAUNCH_GENERATION_ID,
    );
    const modelsChanged = !modelOpt || !sameModels(current, next);

    const facts: ListingTitleFacts = {
      ip: listingIp(product.brandName, product.characterName),
      ipEvidence: [...product.tags, product.sourceFolder ?? ""],
      productTypeId: product.productType,
      models: next,
      magsafe: product.tags.includes(MAGSAFE_TAG),
    };
    const repaired = repairListingTitle(product.title, facts);
    const titleChanged = repaired.changed;

    if (!modelsChanged && !titleChanged) {
      already++;
      continue;
    }

    if (modelsChanged) {
      if (!modelOpt) created++;
      else extended++;
      console.log(
        `  #${product.id} models  ${current.length || 0} → ${next.length}` +
          `${!modelOpt ? "  (created axis)" : ""}`,
      );
    }
    if (titleChanged) {
      titles++;
      console.log(`  #${product.id} title`);
      console.log(`    before  ${product.title}`);
      console.log(`    after   ${repaired.title}`);
    }

    if (mode.preview) continue;

    if (!modelOpt) {
      await db.insert(productOptions).values({
        productId: product.id,
        name: MODEL_OPTION_NAME,
        position: 0,
        values: next,
      });
    } else if (modelsChanged) {
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

    if (titleChanged) {
      await db
        .update(products)
        .set({ title: repaired.title, updatedAt: new Date() })
        .where(eq(products.id, product.id));
    } else if (modelsChanged) {
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
  Model axes ${mode.verb("created", "to create")}  : ${created}
  Model lists ${mode.verb("extended", "to extend")} : ${extended}
  Titles ${mode.verb("repaired", "to repair")}     : ${titles}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${mode.preview ? "\n  Re-run with --apply (or `npm run backfill:iphone-18:apply`) to commit.\n" : ""}
  Product pages ISR for an hour; a deploy (or waiting out the window) picks
  the new 18 Pro / Pro Max chips up on the live storefront.
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

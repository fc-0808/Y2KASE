/**
 * Remove iPhone Duo from numbered iPhone-case listings.
 *
 *   npm run backfill:iphone-duo          # preview
 *   npm run backfill:iphone-duo:apply    # write
 *
 * Duo was briefly added as another iPhone Model. Those designs do not fit
 * the foldable, so the value has to come back off every iphone_case row.
 * Duo cases are a separate product type (`iphone_duo_case`) and are not
 * created here.
 *
 * Preview is the default — see scripts/lib/cli.ts.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { productOptions, products } from "../src/lib/db/schema";
import { MODEL_OPTION_NAME } from "../src/lib/pricing";
import { resolveRunMode } from "./lib/cli";

const DUO_MODEL = "iPhone Duo";

function sameModels(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((model, i) => model === b[i]);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const mode = resolveRunMode("Remove iPhone Duo from iPhone cases");

  const rows = await db.query.products.findMany({
    columns: { id: true, productType: true },
    with: {
      options: {
        columns: { id: true, name: true, values: true },
      },
    },
    limit: 20_000,
  });

  const cases = rows.filter((row) => row.productType === "iphone_case");
  console.log(
    `Scanned ${rows.length} product(s); ${cases.length} iPhone case(s).\n`,
  );

  let stripped = 0;
  let already = 0;

  for (const product of cases) {
    const modelOpt = product.options.find(
      (option) => option.name === MODEL_OPTION_NAME,
    );
    const current = modelOpt?.values ?? [];
    if (!current.includes(DUO_MODEL)) {
      already++;
      continue;
    }
    const next = current.filter((model) => model !== DUO_MODEL);
    if (next.length === 0 || sameModels(current, next)) {
      already++;
      continue;
    }

    stripped++;
    console.log(`  #${product.id} models  ${current.length} → ${next.length}`);
    if (mode.preview) continue;

    await db
      .update(productOptions)
      .set({ values: next })
      .where(
        and(
          eq(productOptions.id, modelOpt!.id),
          eq(productOptions.productId, product.id),
        ),
      );
    await db
      .update(products)
      .set({ updatedAt: new Date() })
      .where(eq(products.id, product.id));
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ${mode.preview ? "PREVIEW — no changes written" : "Done."}
  Already without Duo   : ${already}
  Model lists ${mode.verb("stripped", "to strip")} : ${stripped}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${mode.preview ? "\n  Re-run with --apply (or npm run backfill:iphone-duo:apply) to commit.\n" : ""}
  iPhone Duo cases live on their own product type. This script does not
  create those listings.
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Audit — and repair — listing titles against the title contract.
 *
 *   npm run audit:titles          # report only (default; writes nothing)
 *   npm run audit:titles:apply    # rebuild the defective ones + re-file them
 *
 * For ad-hoc runs, invoke directly so flags survive (see scripts/lib/cli.ts):
 *   npx tsx scripts/audit-listing-titles.ts --apply --errors-only
 *
 * Every repair here is DETERMINISTIC: no model is called and nothing is
 * invented. The existing prose is kept verbatim and only the segments the
 * contract composes — the character prefix, the device coverage, the MagSafe
 * suffix — are re-emitted from the product's own data. See
 * `src/lib/catalog/listing-title.ts` for why those segments are code and not a
 * prompt.
 *
 * The two defects this exists to find are both invisible by eye:
 *
 *   • device_overclaim — the title advertises an iPhone generation the product
 *     is not sold for. The old copy prompt hard-coded a model list, so this is
 *     systematic rather than occasional, and it is a false compatibility claim
 *     on a live storefront.
 *   • missing_ip — the product is classified as a character the title never
 *     names, so the listing cannot be found by the one term that would sell it.
 *
 * Slugs are never touched: they are the public URLs and the keys in every index
 * already submitted. Collection membership IS re-derived for each repaired
 * product, because a title fix that leaves the product filed under its old,
 * wrong classification has only done half the job.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { products } from "../src/lib/db/schema";
import { MODEL_OPTION_NAME } from "../src/lib/pricing";
import { MAGSAFE_TAG } from "../src/lib/catalog/magsafe";
import { refileProduct } from "../src/lib/catalog/collection-filing";
import {
  auditListingTitle,
  listingIp,
  repairListingTitle,
  type ListingTitleFacts,
  type TitleIssue,
  type TitleIssueCode,
} from "../src/lib/catalog/listing-title";
import { hasFlag, readCount, resolveRunMode } from "./lib/cli";

type Row = {
  id: number;
  slug: string;
  title: string;
  status: string;
  facts: ListingTitleFacts;
  issues: TitleIssue[];
};

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const mode = resolveRunMode("Listing title audit");
  const errorsOnly = hasFlag("errors-only");
  const limit = readCount("limit") ?? Infinity;

  const raw = await db.query.products.findMany({
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
    with: { options: { columns: { name: true, values: true } } },
    limit: 20000,
  });

  const rows: Row[] = raw.map((product) => {
    const facts: ListingTitleFacts = {
      ip: listingIp(product.brandName, product.characterName),
      ipEvidence: [...product.tags, product.sourceFolder ?? ""],
      productTypeId: product.productType,
      models:
        product.options.find((option) => option.name === MODEL_OPTION_NAME)
          ?.values ?? [],
      magsafe: product.tags.includes(MAGSAFE_TAG),
    };
    return {
      id: product.id,
      slug: product.slug,
      title: product.title,
      status: product.status,
      facts,
      issues: auditListingTitle(product.title, facts),
    };
  });

  const tally = new Map<TitleIssueCode, number>();
  for (const row of rows) {
    for (const issue of row.issues) {
      tally.set(issue.code, (tally.get(issue.code) ?? 0) + 1);
    }
  }

  const flagged = rows.filter((row) =>
    errorsOnly
      ? row.issues.some((issue) => issue.severity === "error")
      : row.issues.length > 0,
  );

  console.log(`════════════════════════════════════════════════
  Products scanned   : ${rows.length}
  Clean titles       : ${rows.length - rows.filter((r) => r.issues.length > 0).length}
  With any issue     : ${rows.filter((r) => r.issues.length > 0).length}
  With a false claim : ${rows.filter((r) => r.issues.some((i) => i.severity === "error")).length}
════════════════════════════════════════════════`);
  for (const [code, count] of [...tally].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${code.padEnd(18)} ${count}`);
  }
  console.log();

  // Repairing a title whose only issue is `non_english` would just re-emit the
  // same untranslatable prose — that one needs a model, and already has a home
  // in `npm run audit:copy:rewrite`.
  const targets = flagged
    .filter((row) => !row.issues.every((issue) => issue.code === "non_english"))
    .slice(0, limit === Infinity ? undefined : limit);

  let repaired = 0;
  let unchanged = 0;

  for (const row of targets) {
    const next = repairListingTitle(row.title, row.facts);
    if (!next.changed) {
      unchanged++;
      continue;
    }
    const after = auditListingTitle(next.title, row.facts);
    const remaining = after.map((issue) => issue.code);
    const fixed = row.issues
      .map((issue) => issue.code)
      .filter((code) => !remaining.includes(code));

    console.log(`  #${row.id} [${row.status}]`);
    console.log(`    before  ${row.title}`);
    console.log(`    after   ${next.title}`);
    console.log(
      `    fixes   ${fixed.join(", ") || "formatting only"}${
        // What repair cannot settle: a title and a brand column that disagree,
        // or a classification nothing corroborates. Both need a human or a
        // fresh look at the photos, so they are named rather than papered over.
        remaining.length > 0 ? `   still open: ${remaining.join(", ")}` : ""
      }`,
    );

    if (mode.preview) {
      repaired++;
      continue;
    }

    await db
      .update(products)
      .set({ title: next.title, updatedAt: new Date() })
      .where(eq(products.id, row.id));

    const filing = await refileProduct(row.id);
    if (filing.added.length > 0 || filing.removed.length > 0) {
      console.log(
        `    filed   +[${filing.added.join(", ")}]${
          filing.removed.length > 0 ? ` -[${filing.removed.join(", ")}]` : ""
        }`,
      );
    }
    if (filing.unseeded.length > 0) {
      console.log(
        `    ⚠ missing collections: ${filing.unseeded.join(", ")} — run npm run seed:collections`,
      );
    }
    repaired++;
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ${mode.preview ? "PREVIEW — no changes written" : "Done."}
  Titles ${mode.verb("rebuilt", "to rebuild")} : ${repaired}
  Already correct        : ${unchanged}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${mode.preview ? "\n  Re-run with --apply (or `npm run audit:titles:apply`) to commit.\n" : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

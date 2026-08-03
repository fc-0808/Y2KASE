/**
 * Audit — and repair — product copy that violates the English-only contract.
 *
 *   npm run audit:copy            # report only (default; writes nothing)
 *   npm run audit:copy:apply      # strip junk tags — deterministic, no AI, free
 *   npm run audit:copy:rewrite    # …and regenerate the non-English listings
 *
 * For ad-hoc runs, invoke directly so flags survive (see scripts/lib/cli.ts):
 *   npx tsx scripts/audit-catalog-copy.ts --apply --regenerate --limit 10
 *
 * Two classes of defect, handled differently:
 *
 *  1. Junk tags — Chinese supplier folder names and device-model dumps such as
 *     `hot-… 13-14-14pro-…-18promax_variants`, which reached `products.tags`
 *     because the ingest used the raw source-folder name as a tag. Fixing these
 *     is deterministic, so it happens by default and costs nothing.
 *
 *  2. Orphaned MagSafe claims — copy that still advertises MagSafe on a product
 *     that is not tagged MagSafe. The old prompt wrote "MagSafe" into titles and
 *     descriptions itself, so demoting a false positive could leave the claim
 *     behind. Deterministic to fix, so it also runs by default.
 *
 *  3. Non-English title/description — the vision model transcribing the
 *     supplier's Chinese listing text. There is no correct answer to derive
 *     locally, so `--regenerate` re-runs copy generation against the product's
 *     existing R2 photos using the hardened prompt. Opt-in, because it spends
 *     vision credits and rewrites live copy.
 *
 * Slugs are never touched — inbound links and indexed URLs must stay valid.
 * MagSafe state is preserved: a regenerated listing that was tagged MagSafe has
 * the wording re-applied through `applyMagSafeCopy`.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { products, productImages } from "../src/lib/db/schema";
import { generateProductCopy } from "../src/lib/ai";
import { getProductType } from "../src/lib/catalog/product-types";
import { mapWithConcurrency } from "../src/lib/catalog/concurrency";
import { MODEL_OPTION_NAME } from "../src/lib/pricing";
import {
  listingIp,
  repairListingTitle,
} from "../src/lib/catalog/listing-title";
import {
  applyMagSafeCopy,
  hasTextualMagSafe,
  removeMagSafeCopy,
  MAGSAFE_TAG,
} from "../src/lib/catalog/magsafe";
import {
  findForbiddenScript,
  sanitizeTag,
  InvalidProductCopyError,
} from "../src/lib/catalog/copy-schema";
import { hasFlag, readCount, resolveRunMode } from "./lib/cli";

/** Images sent to the regeneration pass — matches the ingest pipeline. */
const REGEN_IMAGE_COUNT = 4;

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const mode = resolveRunMode("Catalog copy audit");
  const dryRun = mode.preview;
  const regenerate = hasFlag("regenerate");
  const limit = readCount("limit") ?? Infinity;
  const concurrency = Math.max(1, Number(process.env.INGEST_CONCURRENCY) || 3);

  const rows = await db.query.products.findMany({
    columns: {
      id: true,
      slug: true,
      title: true,
      description: true,
      tags: true,
      status: true,
      productType: true,
      brandName: true,
      characterName: true,
      sourceFolder: true,
    },
    with: {
      images: {
        columns: { id: true, url: true, position: true },
        orderBy: (img, { asc }) => asc(img.position),
      },
      options: { columns: { name: true, values: true } },
    },
    limit: 20000,
  });

  // ── Classify the damage ────────────────────────────────────────────────────
  const needsTagCleanup = rows.filter((p) => {
    const cleaned = cleanTags(p.tags);
    return cleaned.length !== p.tags.length || cleaned.some((t, i) => t !== p.tags[i]);
  });
  const needsRewrite = rows.filter(
    (p) =>
      findForbiddenScript(p.title) !== null ||
      findForbiddenScript(p.description) !== null,
  );
  // A MagSafe claim on a product we do not classify as MagSafe is a promise the
  // storefront makes and the product cannot keep.
  const orphanedClaims = rows.filter(
    (p) =>
      !p.tags.includes(MAGSAFE_TAG) &&
      hasTextualMagSafe(p.title, p.description),
  );

  console.log(`════════════════════════════════════════════════
  Products scanned              : ${rows.length}
  With junk / non-English tags  : ${needsTagCleanup.length}
  Untagged but claiming MagSafe : ${orphanedClaims.length}
  With non-English title/desc   : ${needsRewrite.length}
════════════════════════════════════════════════
`);

  // ── 1. Deterministic tag cleanup ──────────────────────────────────────────
  let tagsFixed = 0;
  for (const p of needsTagCleanup) {
    const cleaned = cleanTags(p.tags);
    const dropped = p.tags.filter((t) => !cleaned.includes(t));
    console.log(
      `  ${dryRun ? "would clean" : "✓ cleaned"} #${p.id} tags — dropped ${dropped.length}: ${dropped
        .map((t) => `"${t.slice(0, 40)}"`)
        .join(", ")}`,
    );
    if (dryRun) continue;
    await db
      .update(products)
      .set({ tags: cleaned, updatedAt: new Date() })
      .where(eq(products.id, p.id));
    tagsFixed++;
  }

  // ── 2. Strip MagSafe claims from products that are not MagSafe ────────────
  let claimsFixed = 0;
  for (const p of orphanedClaims) {
    const stripped = removeMagSafeCopy({
      title: p.title,
      description: p.description,
      tags: p.tags,
    });
    if (!stripped.changed) continue;
    console.log(
      `  ${mode.verb("✓ unclaimed", "would unclaim")} #${p.id} → ${stripped.title.slice(0, 62)}`,
    );
    if (dryRun) continue;
    await db
      .update(products)
      .set({
        title: stripped.title,
        description: stripped.description,
        tags: stripped.tags,
        updatedAt: new Date(),
      })
      .where(eq(products.id, p.id));
    claimsFixed++;
  }

  // ── 3. Regenerate non-English listings ────────────────────────────────────
  let rewritten = 0;
  let rewriteFailed = 0;

  if (!regenerate && needsRewrite.length > 0) {
    console.log(
      `\n  ${needsRewrite.length} listing(s) need English copy. Re-run with --regenerate to rewrite them:`,
    );
    for (const p of needsRewrite) {
      console.log(`    #${p.id} [${p.status}] ${p.title.slice(0, 60)}`);
    }
  }

  if (regenerate) {
    const targets = needsRewrite
      .filter((p) => p.images.length > 0)
      .slice(0, limit === Infinity ? undefined : limit);
    const skipped = needsRewrite.length - targets.length;
    console.log(
      `\n  Regenerating ${targets.length} listing(s) at concurrency ${concurrency}` +
        `${skipped > 0 ? ` (${skipped} skipped — no images or over --limit)` : ""}.\n`,
    );

    await mapWithConcurrency(targets, concurrency, async (p) => {
      const type = getProductType(p.productType);
      let copy;
      try {
        copy = await generateProductCopy(
          p.images.slice(0, REGEN_IMAGE_COUNT).map((i) => i.url),
          undefined, // the old title is the contaminated input — never feed it back
          {
            id: type.id,
            label: type.label,
            noun: type.noun,
          },
          (m) => console.log(`    #${p.id} ${m}`),
        );
      } catch (err) {
        rewriteFailed++;
        console.error(
          `  ✗ #${p.id} ${err instanceof InvalidProductCopyError ? err.message : err instanceof Error ? err.message : err}`,
        );
        return;
      }

      // Keep any tags that were already clean, and preserve MagSafe state — the
      // hardened prompt is forbidden from writing MagSafe wording itself.
      const wasMagsafe = p.tags.includes(MAGSAFE_TAG);
      const merged = Array.from(
        new Set([...copy.tags, ...cleanTags(p.tags)]),
      );
      // The prompt no longer asks for device coverage; it is composed from the
      // product's own variant matrix so a rewrite cannot invent a fit.
      const composed = repairListingTitle(copy.title, {
        ip: listingIp(p.brandName, p.characterName),
        ipEvidence: [...p.tags, p.sourceFolder ?? ""],
        productTypeId: p.productType,
        models:
          p.options.find((option) => option.name === MODEL_OPTION_NAME)
            ?.values ?? [],
        magsafe: wasMagsafe,
      }).title;
      const next = wasMagsafe
        ? applyMagSafeCopy({
            title: composed,
            description: copy.description,
            tags: merged,
          })
        : { title: composed, description: copy.description, tags: merged };

      console.log(`  ${dryRun ? "would rewrite" : "✓"} #${p.id} → ${next.title}`);
      if (dryRun) {
        rewritten++;
        return;
      }

      await db
        .update(products)
        .set({
          title: next.title,
          description: next.description,
          tags: next.tags,
          materials: copy.materials || null,
          updatedAt: new Date(),
        })
        .where(eq(products.id, p.id));

      const hero = p.images[0];
      if (hero && copy.altText) {
        await db
          .update(productImages)
          .set({ altText: copy.altText })
          .where(eq(productImages.id, hero.id));
      }
      rewritten++;
    });
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ${dryRun ? "PREVIEW — no changes written" : "Done."}
  Tag sets ${mode.verb("cleaned", "to clean")}    : ${dryRun ? needsTagCleanup.length : tagsFixed}
  MagSafe claims ${mode.verb("removed", "to remove")}: ${dryRun ? orphanedClaims.length : claimsFixed}
  Listings ${mode.verb("rewritten", "to rewrite")}  : ${rewritten}${rewriteFailed > 0 ? `   Failed: ${rewriteFailed}` : ""}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${dryRun ? "\n  Re-run with --apply (or `npm run audit:copy:apply`) to commit.\n" : ""}`);
  process.exit(rewriteFailed > 0 ? 1 : 0);
}

/**
 * Apply the ingest-time tag rules to an existing tag set.
 * `magsafe` is preserved rather than sanitised away — whether a product is
 * MagSafe is `backfill:magsafe --revalidate`'s decision, not this script's.
 */
function cleanTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    if (tag === MAGSAFE_TAG) {
      if (!out.includes(tag)) out.push(tag);
      continue;
    }
    const clean = sanitizeTag(tag);
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Backfill / audit MagSafe classification across the EXISTING catalogue,
 * without re-uploading any images.
 *
 *   npm run backfill:magsafe             # preview: classify unclassified products
 *   npm run backfill:magsafe:apply       # …and write the result
 *   npm run magsafe:revalidate           # preview: audit what is already tagged
 *   npm run magsafe:revalidate:apply     # …and correct it
 *
 * Previewing is the default and writing needs `--apply`, because `npm run x --
 * --flag` does not reliably forward flags — see scripts/lib/cli.ts.
 *
 * Default mode classifies phone cases that are not yet marked MagSafe, using the
 * strict temperature-0 verifier on their existing R2 photos.
 *
 * `--revalidate` re-inspects products that ARE tagged MagSafe and routes each to
 * its correct terminal state: keep, queue for review, or demote. Use it after a
 * bad ingest run — a catalogue classified before the verifier existed can be
 * ~80% false positives, and queueing all of them for manual review is not a
 * remediation. Demotion only strips the markers this pipeline added
 * (see `removeMagSafeCopy`) and is reversible from the admin bulk action.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import {
  products,
  productCollections,
  collections,
} from "../src/lib/db/schema";
import { verifyMagSafe } from "../src/lib/ai";
import { mapWithConcurrency } from "../src/lib/catalog/concurrency";
import {
  decideMagSafe,
  hasTextualMagSafe,
  applyMagSafeCopy,
  removeMagSafeCopy,
  MAGSAFE_TAG,
  type MagSafeVerdict,
} from "../src/lib/catalog/magsafe";
import { hasFlag, resolveRunMode } from "./lib/cli";

// MagSafe only applies to phone cases.
const CANDIDATE_TYPES = new Set(["iphone_case", "samsung_case", "pixel_case"]);

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  // Re-inspect products ALREADY classified as MagSafe and correct them.
  const revalidate = hasFlag("revalidate");
  const mode = resolveRunMode(
    revalidate ? "MagSafe re-validation" : "MagSafe backfill",
  );
  const dryRun = mode.preview;
  const concurrency = Math.max(1, Number(process.env.INGEST_CONCURRENCY) || 4);

  const magCol = await db.query.collections.findFirst({
    where: eq(collections.slug, "magsafe"),
    columns: { id: true },
  });
  if (!magCol) {
    console.error(
      'No "magsafe" collection. Run `npm run seed:collections` first.',
    );
    process.exit(1);
  }

  const rows = await db.query.products.findMany({
    columns: {
      id: true,
      title: true,
      description: true,
      tags: true,
      productType: true,
      needsMagsafeReview: true,
    },
    with: {
      images: {
        columns: { url: true, position: true },
        orderBy: (img, { asc }) => asc(img.position),
        limit: 3,
      },
      collections: { columns: { collectionId: true } },
    },
    limit: 10000,
  });

  // ── Revalidation mode: audit already-tagged MagSafe products ──────────────
  if (revalidate) {
    const tagged = rows.filter(
      (p) => p.tags.includes(MAGSAFE_TAG) && p.images.length > 0,
    );
    console.log(
      `Re-validating ${tagged.length} MagSafe-tagged product(s) against the strict verifier. Concurrency ${concurrency}.\n`,
    );
    let kept = 0;
    let queued = 0;
    let demoted = 0;
    let failed = 0;

    await mapWithConcurrency(tagged, concurrency, async (p) => {
      const verdict = await verifyMagSafe(p.images.map((i) => i.url));
      if (!verdict) {
        // Could not verify — leave the product exactly as it is rather than
        // demoting a possibly-correct listing on the strength of an outage.
        failed++;
        console.log(`  ? #${p.id} verification unavailable — left unchanged`);
        return;
      }

      // The existing title/tag cannot corroborate anything here: they were very
      // likely written by the same classifier we are auditing.
      const decision = decideMagSafe({ human: false, verifier: verdict });

      if (decision === "confirmed") {
        kept++;
        if (p.needsMagsafeReview && !dryRun) {
          await db
            .update(products)
            .set({ needsMagsafeReview: false, updatedAt: new Date() })
            .where(eq(products.id, p.id));
        }
        return;
      }

      // ── Unconfirmed → take the badge down ─────────────────────────────────
      // Both remaining outcomes strip the MagSafe claim, because these products
      // are already PUBLISHED with it: leaving an unverified badge up while a
      // human gets round to it is the exact failure we are fixing. They differ
      // only in whether we ask anyone about it — `review` keeps the product in
      // /admin/products/magsafe-review (that page keys off `needsMagsafeReview`,
      // not the tag), and confirming there restores the badge in full.
      const forReview = decision === "review";
      if (forReview) queued++;
      else demoted++;

      const stripped = removeMagSafeCopy({
        title: p.title,
        description: p.description,
        tags: p.tags,
      });
      const verb = forReview
        ? dryRun
          ? "would unbadge + queue"
          : "⟳ unbadged + queued"
        : dryRun
          ? "would demote"
          : "✗ demoted";
      console.log(`  ${verb} #${p.id} ${stripped.title.slice(0, 54)}`);
      if (dryRun) return;

      await db
        .update(products)
        .set({
          title: stripped.title,
          description: stripped.description,
          tags: stripped.tags,
          needsMagsafeReview: forReview,
          updatedAt: new Date(),
        })
        .where(eq(products.id, p.id));
      await db
        .delete(productCollections)
        .where(
          and(
            eq(productCollections.productId, p.id),
            eq(productCollections.collectionId, magCol.id),
          ),
        );
    });

    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ${dryRun ? "PREVIEW — no changes written" : "Done."}
  Verified — badge kept     : ${kept}
  Unconfirmed — badge down, queued for review: ${queued}
  Rejected — badge down    : ${demoted}
  Unverifiable — untouched : ${failed}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Queued items are at /admin/products/magsafe-review — confirming one restores
  its badge, title, description, tag and collection in full.
${dryRun ? "\n  Re-run with `npm run magsafe:revalidate:apply` to commit.\n" : ""}`);
    process.exit(0);
  }

  const candidates = rows.filter(
    (p) => CANDIDATE_TYPES.has(p.productType) && p.images.length > 0,
  );
  console.log(
    `Scanning ${candidates.length} phone-case product(s) for MagSafe ` +
      `(of ${rows.length} total). Concurrency ${concurrency}.\n`,
  );

  let visionCalls = 0;
  let confirmed = 0;
  let queued = 0;
  let updated = 0;
  let failed = 0;

  await mapWithConcurrency(candidates, concurrency, async (p) => {
    // An existing MagSafe mention is treated as a human assertion here: the rows
    // this mode touches are ones a person or a manifest labelled, and anything
    // the classifier itself wrote is handled by --revalidate instead.
    const human = hasTextualMagSafe(p.title) || p.tags.includes(MAGSAFE_TAG);

    let verifier: MagSafeVerdict | undefined;
    if (!human) {
      visionCalls++;
      verifier = (await verifyMagSafe(p.images.map((i) => i.url))) ?? undefined;
      if (!verifier) {
        failed++;
        console.error(`  ✗ #${p.id} verification unavailable — skipped`);
        return;
      }
    }

    const decision = decideMagSafe({ human, verifier });
    if (decision === "none") return;

    // ── Low-confidence lone guess → review queue (don't touch live copy) ──
    if (decision === "review") {
      queued++;
      if (p.needsMagsafeReview) return; // already queued
      console.log(
        `  ${dryRun ? "would queue" : "⟳ queued"} #${p.id} ${p.title.slice(0, 54)}`,
      );
      if (!dryRun) {
        await db
          .update(products)
          .set({ needsMagsafeReview: true, updatedAt: new Date() })
          .where(eq(products.id, p.id));
        updated++;
      }
      return;
    }

    // ── Confirmed → apply MagSafe copy + collection, clear any review flag ──
    confirmed++;
    const applied = applyMagSafeCopy({
      title: p.title,
      description: p.description,
      tags: p.tags,
    });
    const inCollection = p.collections.some(
      (c) => c.collectionId === magCol.id,
    );
    const needsWrite = applied.changed || !inCollection || p.needsMagsafeReview;
    if (!needsWrite) return; // already fully classified

    console.log(
      `  ${dryRun ? "would confirm" : "✓"} #${p.id} ${applied.title.slice(0, 54)}`,
    );
    if (dryRun) {
      updated++;
      return;
    }

    if (applied.changed || p.needsMagsafeReview) {
      await db
        .update(products)
        .set({
          title: applied.title,
          description: applied.description,
          tags: applied.tags,
          needsMagsafeReview: false,
          updatedAt: new Date(),
        })
        .where(eq(products.id, p.id));
    }
    if (!inCollection) {
      await db
        .insert(productCollections)
        .values({ productId: p.id, collectionId: magCol.id })
        .onConflictDoNothing();
    }
    updated++;
  });

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ${dryRun ? "PREVIEW — no changes written" : "Done."}
  Vision checks: ${visionCalls}
  Confirmed MagSafe: ${confirmed}   Queued for review: ${queued}
  ${dryRun ? "Would write" : "Wrote"}: ${updated}   Failed: ${failed}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${dryRun ? "\n  Re-run with `npm run backfill:magsafe:apply` to commit.\n" : ""}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

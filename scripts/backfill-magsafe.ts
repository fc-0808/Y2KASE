/**
 * Backfill MagSafe classification across the EXISTING catalogue, without
 * re-uploading any images.
 *
 *   npm run backfill:magsafe -- --preview   # preview, writes nothing
 *   npm run backfill:magsafe                # apply changes
 *
 * (Use --preview, not --dry-run: npm reserves --dry-run and would swallow it.)
 *
 * For each phone-case product it re-runs the focused MagSafe vision check on the
 * product's existing R2 photos (skipping ones already flagged, to save cost),
 * and for MagSafe products idempotently: ensures "MagSafe" is in the title +
 * description, adds the `magsafe` tag, and links the MagSafe collection. Safe to
 * re-run — nothing already-correct is touched.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import {
  products,
  productCollections,
  collections,
} from "../src/lib/db/schema";
import { detectMagSafe } from "../src/lib/ai";
import { mapWithConcurrency } from "../src/lib/catalog/concurrency";
import {
  decideMagSafe,
  hasTextualMagSafe,
  applyMagSafeCopy,
} from "../src/lib/catalog/magsafe";

// MagSafe only applies to phone cases.
const CANDIDATE_TYPES = new Set(["iphone_case", "samsung_case", "pixel_case"]);

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const dryRun =
    process.argv.includes("--preview") || process.argv.includes("--dry-run");
  // Re-check products ALREADY classified as MagSafe with strict high-confidence
  // vision, and queue any that no longer pass for human review. Useful to audit
  // a looser earlier run.
  const revalidate = process.argv.includes("--revalidate");
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
      (p) => p.tags.includes("magsafe") && p.images.length > 0,
    );
    console.log(
      `\n${dryRun ? "[DRY RUN] " : ""}Re-validating ${tagged.length} MagSafe-tagged product(s) at high confidence.\n`,
    );
    let kept = 0;
    let queued = 0;
    let failed = 0;
    await mapWithConcurrency(tagged, concurrency, async (p) => {
      let verdict;
      try {
        verdict = await detectMagSafe(p.images.map((i) => i.url));
      } catch {
        failed++;
        return;
      }
      const strong = verdict.magsafe && verdict.confidence === "high";
      if (strong) {
        kept++;
        if (p.needsMagsafeReview && !dryRun) {
          await db
            .update(products)
            .set({ needsMagsafeReview: false, updatedAt: new Date() })
            .where(eq(products.id, p.id));
        }
        return;
      }
      queued++;
      console.log(
        `  ${dryRun ? "would queue" : "⟳ queued"} #${p.id} ${p.title.slice(0, 54)}`,
      );
      if (!dryRun && !p.needsMagsafeReview) {
        await db
          .update(products)
          .set({ needsMagsafeReview: true, updatedAt: new Date() })
          .where(eq(products.id, p.id));
      }
    });
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ${dryRun ? "DRY RUN — no changes written" : "Done."}
  High-confidence kept: ${kept}   Queued for review: ${queued}   Failed: ${failed}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
    process.exit(0);
  }

  const candidates = rows.filter(
    (p) => CANDIDATE_TYPES.has(p.productType) && p.images.length > 0,
  );
  console.log(
    `\n${dryRun ? "[DRY RUN] " : ""}Scanning ${candidates.length} phone-case product(s) for MagSafe ` +
      `(of ${rows.length} total). Concurrency ${concurrency}.\n`,
  );

  let visionCalls = 0;
  let confirmed = 0;
  let queued = 0;
  let updated = 0;
  let failed = 0;

  await mapWithConcurrency(candidates, concurrency, async (p) => {
    // A textual mention (title / existing tag) is one signal; otherwise pay for
    // one vision check to get the second.
    const textual = hasTextualMagSafe(p.title) || p.tags.includes("magsafe");

    let vision = false;
    let confidence: "high" | "low" | "none" = "none";
    if (!textual) {
      visionCalls++;
      try {
        const verdict = await detectMagSafe(p.images.map((i) => i.url));
        vision = verdict.magsafe;
        confidence = verdict.magsafe ? verdict.confidence : "none";
      } catch (e) {
        failed++;
        console.error(
          `  ✗ #${p.id} detection failed: ${e instanceof Error ? e.message : e}`,
        );
        return;
      }
    }

    const decision = decideMagSafe({ vision, confidence, textual });
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
  ${dryRun ? "DRY RUN — no changes written" : "Done."}
  Vision checks: ${visionCalls}
  Confirmed MagSafe: ${confirmed}   Queued for review: ${queued}
  ${dryRun ? "Would write" : "Wrote"}: ${updated}   Failed: ${failed}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

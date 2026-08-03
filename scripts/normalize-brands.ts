/**
 * Re-point every product's brand metadata at the canonical registry, and
 * reconcile the brand/character collections that follow from it.
 *
 *   npm run normalize:brands           # preview
 *   npm run normalize:brands:apply     # commit
 *
 * Deterministic and offline — no model calls, no image reads. It exists because
 * the registry is now the single source of truth for brand names, while rows
 * written by earlier classifiers hold values that predate it:
 *
 *   - a character in the brand column ("Hello Kitty" as a brand)
 *   - lowercased character names ("hello kitty")
 *   - a character invented to fill the field, with no evidence behind it
 *     (every Miffy case labelled Sanrio / hello kitty, because "miffy" used to
 *     be a Sanrio alias and the character fell back to the first in the list)
 *
 * The last case can't be repaired from text alone, so rows whose stored
 * character contradicts their own title are re-derived from the title and
 * reported. Anything the registry can't resolve at all is listed for a human —
 * never guessed at, and never silently cleared.
 *
 * Use `npm run backfill:brand:refresh` when you want the vision model to take
 * another look; this script only makes existing data internally consistent.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../src/lib/db";
import {
  classifyBrandContext,
  resolveBrandAssignment,
  type BrandConfidence,
} from "../src/lib/catalog/brands";
import { applyBrandAssignment } from "../src/lib/catalog/brand-assignment";
import { resolveRunMode } from "./lib/cli";

const CONFIDENCES: BrandConfidence[] = ["high", "medium", "low", "none"];

function asConfidence(value: string | null): BrandConfidence {
  return CONFIDENCES.includes(value as BrandConfidence)
    ? (value as BrandConfidence)
    : "low";
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const mode = resolveRunMode("brand normalisation");

  const rows = await db.query.products.findMany({
    columns: {
      id: true,
      title: true,
      sourceFolder: true,
      brandName: true,
      characterName: true,
      brandConfidence: true,
      brandEvidence: true,
    },
  });

  let changed = 0;
  let alreadyCanonical = 0;
  let unclassified = 0;
  const unresolved: string[] = [];

  for (const row of rows) {
    if (!row.brandName && !row.characterName) {
      unclassified += 1;
      continue;
    }

    const fromText = classifyBrandContext([row.title, row.sourceFolder]);
    let resolved = resolveBrandAssignment(row.brandName, row.characterName);

    // A character the title actively contradicts is a fabrication from the old
    // `characters[0]` fallback, not a curated decision. Trust the text instead.
    const contradicted =
      resolved.ok &&
      fromText.brandId != null &&
      fromText.brandId !== resolved.brand.id;
    if (contradicted && fromText.brandId) {
      resolved = resolveBrandAssignment(fromText.brandId, fromText.characterId);
    }
    if (!resolved.ok) {
      // Drop the character and keep the brand when only the character is bad.
      resolved = resolveBrandAssignment(row.brandName, null);
    }
    if (!resolved.ok) {
      unresolved.push(
        `  ? #${row.id} ${row.brandName ?? "—"} / ${row.characterName ?? "—"} — ${row.title}`,
      );
      continue;
    }

    const brandName = resolved.brand.brand;
    const characterName = resolved.character?.name ?? null;
    if (brandName === row.brandName && characterName === row.characterName) {
      alreadyCanonical += 1;
      continue;
    }

    changed += 1;
    console.log(
      `  ${mode.verb("✓", "would set")} #${row.id} ${row.brandName ?? "—"} / ${row.characterName ?? "—"} → ${brandName} / ${characterName ?? "—"}${contradicted ? "  (title disagreed)" : ""}`,
    );
    if (mode.preview) continue;

    const sync = await applyBrandAssignment(row.id, {
      brandId: resolved.brand.id,
      brandName,
      characterId: resolved.character?.id ?? null,
      characterName,
      // A row we re-derived carries the text verdict's confidence; a row we
      // merely renamed keeps whatever confidence it already had.
      confidence: contradicted
        ? fromText.confidence
        : asConfidence(row.brandConfidence),
      evidence: contradicted ? fromText.evidence : (row.brandEvidence ?? []),
    });
    if (sync.unseeded.length > 0) {
      console.log(
        `      ! collections not seeded: ${sync.unseeded.join(", ")} — run npm run seed:collections`,
      );
    }
  }

  if (unresolved.length > 0) {
    console.log(`\nNot in the registry — add them or reassign by hand:`);
    unresolved.forEach((line) => console.log(line));
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ${mode.preview ? "PREVIEW — no changes written" : "Done."}
  Rewritten:        ${changed}
  Already canonical:${alreadyCanonical}
  No brand set:     ${unclassified}
  Unresolvable:     ${unresolved.length}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${mode.preview ? "\n  Re-run with `npm run normalize:brands:apply` to commit.\n" : ""}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Backfill perceptual hashes for product images that don't have one yet.
 *
 *   npm run db:phash        # once, to add the column
 *   npm run backfill:phash  # hash every existing image
 *
 * Downloads each image from its public R2 URL, computes a dHash, and stores it.
 * Idempotent + resumable: only rows where phash IS NULL are processed, so
 * re-running picks up where it left off (e.g. after a transient network error).
 *
 * The same core lives in `src/lib/catalog/phash-backfill.ts` and powers the
 * admin "Find duplicates" button — keep behaviour in sync.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import {
  backfillMissingPhashes,
  getPhashCoverage,
} from "../src/lib/catalog/phash-backfill";
import { PHASH_BACKFILL_BATCH_SIZE } from "../src/lib/catalog/phash-types";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

  const coverage = await getPhashCoverage();
  console.log(
    `\nFound ${coverage.missingImages} image(s) without a perceptual hash` +
      ` (${coverage.unscannedProducts} product(s) unscanned).\n`,
  );

  if (coverage.missingImages === 0) {
    console.log("Nothing to do — every image already has a hash.\n");
    process.exit(0);
  }

  let hashed = 0;
  let failed = 0;
  let batch = 0;

  for (;;) {
    batch++;
    const res = await backfillMissingPhashes(PHASH_BACKFILL_BATCH_SIZE);
    hashed += res.hashed;
    failed += res.failed;
    console.log(
      `Batch ${batch}: hashed ${res.hashed}, failed ${res.failed}, remaining ${res.remaining}`,
    );
    // No progress and nothing left, or a full batch of failures with work
    // still queued — stop so we don't spin forever on permanently broken URLs.
    if (res.remaining === 0) break;
    if (res.hashed === 0) {
      console.error(
        "No images hashed in this batch — remaining URLs may be unreachable. Aborting.",
      );
      break;
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Done.  Hashed: ${hashed}  Failed: ${failed}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  process.exit(failed > 0 && hashed === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

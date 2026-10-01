/**
 * Backfill perceptual hashes for product images that don't have one yet.
 *
 *   npm run db:phash        # once, to add the column
 *   npm run backfill:phash  # hash every existing image
 *
 * Downloads each image from its public R2 URL, computes a v2 composite
 * fingerprint (centre-crop dHash + DCT pHash + colour layout), and stores it.
 * Idempotent + resumable: only rows whose hash is missing or from a previous
 * algorithm version are processed, so re-running picks up where it left off
 * and a matcher upgrade rewrites the old 16-char dHashes.
 *
 * Bytes come from the R2 S3 API (not the public CDN). Failures are skipped
 * via an id cursor so one dead object cannot stall the rest of the catalogue.
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
    `\nFound ${coverage.missingImages} image(s) needing a current fingerprint` +
      ` (${coverage.staleImages} from a previous algorithm, ` +
      `${coverage.unscannedProducts} product(s) unscanned).\n`,
  );

  if (coverage.missingImages === 0) {
    console.log("Nothing to do — every image already has a hash.\n");
    process.exit(0);
  }

  let hashed = 0;
  let failed = 0;
  let batch = 0;
  let afterId = 0;

  for (;;) {
    batch++;
    const res = await backfillMissingPhashes(PHASH_BACKFILL_BATCH_SIZE, afterId);
    hashed += res.hashed;
    failed += res.failed;
    afterId = res.lastId;
    console.log(
      `Batch ${batch}: hashed ${res.hashed}, skipped ${res.failed}, remaining ${res.remaining}`,
    );
    if (res.scanned === 0) break;
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

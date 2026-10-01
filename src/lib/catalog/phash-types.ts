/**
 * Shared shapes + tunables for the perceptual-hash backfill.
 *
 * Deliberately free of any Node-only dependency (Sharp, Drizzle, R2) so the
 * admin client component that drives the scan can import from here without
 * pulling the native image pipeline into the browser bundle. The runtime lives
 * in `./phash-backfill` (server-only).
 */

export type PhashCoverage = {
  /** All gallery images. */
  totalImages: number;
  /** Images whose stored hash is the current fingerprint version. */
  hashedImages: number;
  /**
   * Images still missing a current fingerprint — includes never-hashed rows
   * and rows whose hash is an older algorithm version (those must be
   * recomputed; mixing versions would compare incompatible bit layouts).
   */
  missingImages: number;
  /**
   * Hashed with a previous algorithm. Folded into {@link missingImages} for
   * the scan loop; surfaced separately so the admin copy can say *why*.
   */
  staleImages: number;
  /**
   * Products whose primary (lowest-position) image still lacks a current
   * fingerprint — these cannot participate in duplicate clustering until
   * scanned.
   */
  unscannedProducts: number;
};

export type PhashBackfillBatchResult = {
  /** Images successfully hashed in this batch. */
  hashed: number;
  /** Images that failed to download/decode (left unchanged for a later retry). */
  failed: number;
  /**
   * Images still missing a current fingerprint with `id` greater than
   * {@link lastId} — i.e. work left in *this* pass. Zero means the cursor
   * walked off the end, even if earlier rows were skipped.
   */
  remaining: number;
  /** Rows this batch actually attempted (successes + failures). */
  scanned: number;
  /** Highest `product_images.id` visited; pass back as the next cursor. */
  lastId: number;
};

/** What the admin "Find duplicates" action returns for one batch. */
export type PhashScanResult = PhashBackfillBatchResult & {
  ok: boolean;
  message: string;
};

/**
 * Fingerprint wire prefix. Stored on `product_images.phash`. Must stay in
 * lockstep with `./phash.ts` — duplicated here so client code can recognise
 * a current hash without importing Sharp.
 */
export const FINGERPRINT_PREFIX = "v2:";

/** Images hashed per round-trip — sized to stay inside the serverless budget. */
export const PHASH_BACKFILL_BATCH_SIZE = 25;

/** Parallel downloads + Sharp hashes inside one backfill batch. */
export const PHASH_BACKFILL_CONCURRENCY = 6;

/** True when `value` is a current-version composite fingerprint. */
export function isCurrentFingerprint(value: string | null | undefined): boolean {
  return !!value && value.startsWith(FINGERPRINT_PREFIX);
}

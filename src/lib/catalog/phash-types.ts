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
  hashedImages: number;
  missingImages: number;
  /**
   * Products whose primary (lowest-position) image still lacks a hash — these
   * cannot participate in duplicate clustering until scanned.
   */
  unscannedProducts: number;
};

export type PhashBackfillBatchResult = {
  /** Images successfully hashed in this batch. */
  hashed: number;
  /** Images that failed to download/decode (left null for a later retry). */
  failed: number;
  /** Images still missing a hash after this batch. */
  remaining: number;
};

/** What the admin "Find duplicates" action returns for one batch. */
export type PhashScanResult = PhashBackfillBatchResult & {
  ok: boolean;
  message: string;
};

/** Images hashed per round-trip — sized to stay inside the serverless budget. */
export const PHASH_BACKFILL_BATCH_SIZE = 25;

/**
 * Smoke-test: post the next un-pinned listing (or dry-run coverage check).
 *   npx tsx scripts/smoke-autopin.ts
 *   npx tsx scripts/smoke-autopin.ts --post
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const doPost = process.argv.includes("--post");
  const {
    getAutoPinCoverage,
    getNextListingPreview,
    getListingsPostedToday,
    runAutoPin,
    AUTO_PIN_PER_DAY,
  } = await import("../src/lib/social/auto-pin");
  const { ensurePinterestAccessToken } = await import(
    "../src/lib/social/pinterest-auth"
  );

  const token = await ensurePinterestAccessToken();
  console.log("token:", token.ok ? token.reason : token);

  const coverage = await getAutoPinCoverage();
  const preview = await getNextListingPreview();
  const postedToday = await getListingsPostedToday();
  console.log({
    stuckCount: coverage.stuckCount,
    pinnedProducts: coverage.pinnedProducts,
    remainingProducts: coverage.remainingProducts,
    mediaPinnedToday: coverage.mediaPinnedToday,
    listingsPostedToday: postedToday,
    dailyCap: AUTO_PIN_PER_DAY,
    next: preview
      ? {
          title: preview.productTitle,
          pins: preview.totalPins,
          board: preview.boardName,
        }
      : null,
  });

  if (!doPost) {
    console.log("\nDry run only. Pass --post to publish the next listing.");
    return;
  }

  console.log("\n=== Publishing next listing ===");
  const result = await runAutoPin({ max: 1 });
  console.log({
    ok: result.ok,
    reason: result.reason,
    listingsProcessed: result.listingsProcessed,
    mediaPinned: result.mediaPinned,
    failed: result.failed,
    skipped: result.skipped,
    listings: result.listings,
    errors: result.errors.slice(0, 5),
  });
  if (!result.ok && result.mediaPinned === 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

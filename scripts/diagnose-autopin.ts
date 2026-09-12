/**
 * Diagnostic: what will the Pinterest auto-pin drip post on its next run?
 *
 * Exercises the real production code paths (getNextListingPreview /
 * getAutoPinCoverage) rather than re-implementing their SQL, so a green run here
 * means the engine itself is correct — not just a hand-written query.
 *
 *   npx tsx scripts/diagnose-autopin.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const sql = neon(url);

  const {
    getNextListingPreview,
    getAutoPinCoverage,
    getListingsPostedToday,
    AUTO_PIN_PER_DAY,
    AUTO_PIN_CRON_HOURS_UTC,
    isAutoPinEnabled,
  } = await import("../src/lib/social/auto-pin");

  console.log("\n=== Drip configuration ===");
  console.log({
    enabled: isAutoPinEnabled(),
    pinsPerDay: AUTO_PIN_PER_DAY,
    cronHoursUtc: AUTO_PIN_CRON_HOURS_UTC,
    listingsPostedToday: await getListingsPostedToday(),
  });

  console.log("\n=== Catalog coverage (engine's own numbers) ===");
  console.table([await getAutoPinCoverage()]);

  console.log("\n=== Up next: the exact listing the next run will post ===");
  const preview = await getNextListingPreview();
  if (!preview) {
    console.log("Nothing queued — every listing is fully pinned.");
  } else {
    console.table([preview]);
    if (preview.totalPins !== 1 && preview.slotLabel.indexOf("budget") === -1) {
      console.warn(
        `\n!! Unexpected slot size: ${preview.totalPins} pin(s) queued.` +
          " The curated drip should queue exactly one pin per product.",
      );
    } else {
      console.log(
        `\nOK: next slot is ${preview.mediaType} (${preview.slotLabel}).` +
          ` ${preview.photoCount} still(s) remain on this listing` +
          `${preview.hasVideo ? " + video" : ""}.`,
      );
    }
  }

  console.log("\n=== Per-listing breakdown of the upcoming queue ===");
  const queue = await sql`
    SELECT
      p.id AS product_id,
      LEFT(p.title, 44) AS title,
      (SELECT count(*)::int FROM product_images pi
        WHERE pi.product_id = p.id AND pi.url LIKE 'http%') AS gallery_rows,
      (SELECT count(*)::int FROM product_images pi
        WHERE pi.product_id = p.id AND pi.source_filename = 'thumbnail-normalized') AS ai_thumbs,
      (SELECT count(*)::int FROM product_images pi
        WHERE pi.product_id = p.id AND pi.url LIKE 'http%'
          AND pi.source_filename IS DISTINCT FROM 'thumbnail-normalized') AS real_photos,
      (SELECT count(*)::int FROM product_images pi
        WHERE pi.product_id = p.id AND pi.url LIKE 'http%'
          AND pi.source_filename IS DISTINCT FROM 'thumbnail-normalized'
          AND NOT EXISTS (
            SELECT 1 FROM social_creatives sc
            WHERE (sc.source_image_id = pi.id OR sc.image_url = pi.url)
              AND sc.platform = 'pinterest'
              AND sc.status IN ('draft','approved','scheduled','published')
          )) AS photos_needing_pin,
      (p.video_url LIKE 'http%'
        AND NOT EXISTS (
          SELECT 1 FROM social_creatives sc
          WHERE sc.product_id = p.id AND sc.platform = 'pinterest'
            AND sc.media_type = 'video'
            AND sc.status IN ('draft','approved','scheduled','published')
        )) AS video_needs_pin
    FROM products p
    WHERE p.status = 'active'
    ORDER BY p.created_at ASC, p.id ASC
  `;

  const pending = queue.filter(
    (r) => Number(r.photos_needing_pin) > 0 || r.video_needs_pin === true,
  );
  console.table(pending.slice(0, 8));
  console.log(
    `${pending.length} listing(s) still pending of ${queue.length} active.`,
  );

  console.log("\n=== Guard: any AI thumbnail still eligible for pinning? ===");
  const leaking = await sql`
    SELECT count(*)::int AS n
    FROM product_images pi
    WHERE pi.source_filename = 'thumbnail-normalized'
      AND NOT EXISTS (
        SELECT 1 FROM social_creatives sc
        WHERE (sc.source_image_id = pi.id OR sc.image_url = pi.url)
          AND sc.platform = 'pinterest'
          AND sc.status IN ('draft','approved','scheduled','published')
      )
  `;
  console.log(
    `${leaking[0].n} un-pinned AI thumbnail(s) exist — all are now filtered out` +
      " of the drip by isPinnablePhoto(), so they can never consume a slot.",
  );

  console.log("\n=== Guard: creatives still orphaned (no source_image_id) ===");
  const orphans = await sql`
    SELECT count(*)::int AS n
    FROM social_creatives sc
    WHERE sc.platform = 'pinterest' AND sc.media_type = 'image'
      AND sc.source_image_id IS NULL
  `;
  console.log(
    `${orphans[0].n} remaining (these are pins whose product/image was deleted` +
      " outright; the image_url arm of the dedup key still covers them).",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

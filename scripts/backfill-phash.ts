/**
 * Backfill perceptual hashes for product images that don't have one yet.
 *
 *   npm run db:phash        # once, to add the column
 *   npm run backfill:phash  # hash every existing image
 *
 * Downloads each image from its public R2 URL, computes a dHash, and stores it.
 * Idempotent + resumable: only rows where phash IS NULL are processed, so
 * re-running picks up where it left off (e.g. after a transient network error).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, isNull } from "drizzle-orm";
import { db } from "../src/lib/db";
import { productImages } from "../src/lib/db/schema";
import { dhashFromBuffer } from "../src/lib/catalog/phash";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

  const rows = await db.query.productImages.findMany({
    where: isNull(productImages.phash),
    columns: { id: true, url: true },
  });

  console.log(`\nFound ${rows.length} image(s) without a perceptual hash.\n`);

  let hashed = 0;
  let failed = 0;
  for (const [i, row] of rows.entries()) {
    const label = `[${i + 1}/${rows.length}] #${row.id}`;
    try {
      const res = await fetch(row.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const hash = await dhashFromBuffer(buf);
      if (!hash) throw new Error("could not decode image");

      await db
        .update(productImages)
        .set({ phash: hash })
        .where(eq(productImages.id, row.id));
      hashed++;
      if (i % 25 === 0) console.log(`${label} — ${hash}`);
    } catch (err) {
      failed++;
      console.error(
        `${label} — FAILED: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Done.  Hashed: ${hashed}  Failed: ${failed}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

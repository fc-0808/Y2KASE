/**
 * scripts/backfill-variations.ts
 *
 *   npm run backfill:variations
 *
 * One-time upgrade for products ingested before videos + style tags existed:
 *   1. Derive each product's source folder from its image R2 keys
 *   2. Set product_type = iphone_case + source_folder
 *   3. Find a local video in bestListings/<folder>, upload to R2, set video_url
 *   4. Classify each image's Style with AI, write product_images.style_tags
 *
 * Idempotent: safe to re-run. Skips video upload if video_url already set;
 * re-classification simply overwrites style_tags.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { products, productImages } from "../src/lib/db/schema";
import { classifyImageStyles } from "../src/lib/ai";
import { makeR2Client, uploadVideoToR2 } from "../src/lib/catalog/r2";
import { pickPrimaryVideo, isVideoFile } from "../src/lib/catalog/discover";

const CATALOG_ROOT = process.env.LOCAL_CATALOG_ROOT ?? "./bestListings";

const VIDEO_CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

/** Retry a flaky network operation a few times with linear backoff. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

/** Extract "Category/num" and filename from an R2 image URL. */
function parseKey(url: string): { folder: string; filename: string } | null {
  const marker = "/products/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const rest = decodeURIComponent(url.slice(idx + marker.length)); // Miffy/10/1.webp
  const parts = rest.split("/");
  if (parts.length < 2) return null;
  const filename = path.parse(parts[parts.length - 1]).name;
  const folder = parts.slice(0, -1).join("/");
  return { folder, filename };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME is not set.");
  const r2 = makeR2Client();
  const root = path.resolve(CATALOG_ROOT);

  const all = await db.query.products.findMany({
    with: { images: { orderBy: (i, { asc }) => asc(i.position) } },
  });
  console.log(`Backfilling ${all.length} product(s)...\n`);

  let videosAdded = 0;
  let stylesTagged = 0;

  let skipped = 0;

  for (const product of all) {
    try {
      const firstKey = product.images
        .map((i) => parseKey(i.url))
        .find((k): k is { folder: string; filename: string } => k !== null);
      const folder = firstKey?.folder ?? product.sourceFolder ?? null;

      // 1. product_type + source_folder
      await withRetry(() =>
        db
          .update(products)
          .set({
            productType: "iphone_case",
            sourceFolder: folder ?? undefined,
            updatedAt: new Date(),
          })
          .where(eq(products.id, product.id)),
      );

      // 2. Video (only if not already set and a local file exists)
      if (!product.videoUrl && folder) {
        const localDir = path.join(root, ...folder.split("/"));
        if (fs.existsSync(localDir)) {
          const videos = fs
            .readdirSync(localDir)
            .filter(isVideoFile)
            .map((f) => path.join(localDir, f));
          const primary = pickPrimaryVideo(videos, path.basename(localDir));
          if (primary) {
            const ext = path.extname(primary).toLowerCase();
            const key = `products/${folder}/video${ext}`;
            const body = fs.readFileSync(primary);
            const url = await withRetry(() =>
              uploadVideoToR2(r2, bucket, key, body, VIDEO_CONTENT_TYPES[ext] ?? "video/mp4"),
            );
            await withRetry(() =>
              db
                .update(products)
                .set({ videoUrl: url, updatedAt: new Date() })
                .where(eq(products.id, product.id)),
            );
            videosAdded++;
            console.log(`  #${product.id} ${folder} → video uploaded`);
          }
        }
      }

      // 3. Classify image styles — skip if already done (idempotent / saves cost).
      const alreadyClassified =
        product.images.length > 0 &&
        product.images.every((img) => img.sourceFilename != null);
      if (alreadyClassified) {
        skipped++;
        continue;
      }

      const items = product.images
        .map((img) => {
          const k = parseKey(img.url);
          return k ? { id: img.id, filename: k.filename, imageUrl: img.url } : null;
        })
        .filter((x): x is { id: number; filename: string; imageUrl: string } => x !== null);

      if (items.length > 0) {
        const styleMap = await withRetry(() =>
          classifyImageStyles(
            items.map((it) => ({ filename: it.filename, imageUrl: it.imageUrl })),
          ),
        );
        for (const it of items) {
          await withRetry(() =>
            db
              .update(productImages)
              .set({
                styleTags: styleMap[it.filename] ?? [],
                sourceFilename: it.filename,
              })
              .where(eq(productImages.id, it.id)),
          );
        }
        stylesTagged += items.length;
        console.log(`  #${product.id} ${folder ?? ""} → ${items.length} image(s) classified`);
      }
    } catch (err) {
      console.error(
        `  #${product.id} FAILED (will be retried on next run):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(`  (skipped ${skipped} already-classified product(s))`);

  console.log(
    `\n✓ Done. Videos added: ${videosAdded}. Images classified: ${stylesTagged}.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

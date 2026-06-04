import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { eq, inArray } from "drizzle-orm";
import type { S3Client } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import {
  products,
  productImages,
  productOptions,
  collections,
  productCollections,
} from "@/lib/db/schema";
import { matchCollectionSlugs } from "@/lib/catalog/collections-config";
import {
  generateProductCopy,
  classifyImageStyles,
  slugify,
} from "@/lib/ai";
import { getProductType } from "@/lib/catalog/product-types";
import { uploadWebpToR2, uploadVideoToR2 } from "@/lib/catalog/r2";
import {
  pickPrimaryVideo,
  videoSlotIndex,
  type DiscoveredProductFolder,
} from "@/lib/catalog/discover";

const WEBP_MAX_WIDTH = 1200;
const WEBP_QUALITY = 82;

export function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function toBase64DataUrl(buf: Buffer): string {
  return `data:image/webp;base64,${buf.toString("base64")}`;
}

const VIDEO_CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

export type IngestResult = {
  productId: number;
  slug: string;
  title: string;
  imageCount: number;
  hasVideo: boolean;
};

export type IngestOptions = {
  folder: DiscoveredProductFolder;
  productTypeId: string;
  r2: S3Client;
  bucket: string;
  currency: string;
  /** Key prefix in R2 (folderPath sanitised). */
  keyPrefix?: string;
  log?: (msg: string) => void;
};

/**
 * Match a freshly ingested product to the collection taxonomy and persist the
 * membership rows (idempotent). Resolves matched slugs to ids against the live
 * `collections` table, so only seeded collections are linked.
 */
async function assignCollections(
  productId: number,
  signals: {
    tags: string[];
    title: string;
    sourceFolder: string | null;
    log: (msg: string) => void;
  },
): Promise<void> {
  const slugs = matchCollectionSlugs(signals);
  if (slugs.length === 0) return;

  const rows = await db.query.collections.findMany({
    where: inArray(collections.slug, slugs),
    columns: { id: true, slug: true },
  });
  if (rows.length === 0) return;

  await db
    .insert(productCollections)
    .values(rows.map((c) => ({ productId, collectionId: c.id })))
    .onConflictDoNothing();
  signals.log(`classified → ${rows.map((c) => c.slug).join(", ")}`);
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base || "product";
  let n = 1;
  while (true) {
    const existing = await db.query.products.findFirst({
      where: eq(products.slug, slug),
      columns: { id: true },
    });
    if (!existing) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

/**
 * Ingest a single product folder:
 *   convert → AI copy + style classification → upload to R2 → insert into Neon.
 * Returns the created draft product. Pure of any SQLite resume tracking — the
 * caller decides how to record progress.
 */
export async function ingestProductFolder(
  opts: IngestOptions,
): Promise<IngestResult> {
  const { folder, productTypeId, r2, bucket, currency } = opts;
  const log = opts.log ?? (() => {});
  const type = getProductType(productTypeId);
  const keyBase =
    opts.keyPrefix ??
    folder.folderPath.replace(/[^a-zA-Z0-9/_-]/g, "_");

  // 1. Convert images to WebP (in folder order).
  const webp: { filename: string; buffer: Buffer }[] = [];
  for (const file of folder.imageFiles) {
    const buffer = await sharp(file)
      .resize({ width: WEBP_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    webp.push({ filename: path.parse(file).name, buffer });
  }
  log(`converted ${webp.length} image(s) to WebP`);

  // 2. AI copy (first 4 images) + per-image style classification (all images).
  const dataUrls = webp.map((w) => toBase64DataUrl(w.buffer));
  const copy = await generateProductCopy(dataUrls, folder.categoryHint);
  log(`AI title: ${copy.title}`);

  let styleMap: Record<string, string[]> = {};
  if (type.id === "iphone_case") {
    styleMap = await classifyImageStyles(
      webp.map((w, i) => ({ filename: w.filename, imageUrl: dataUrls[i] })),
    );
  }

  // 3. Upload images to R2.
  const uploaded: { url: string; filename: string; styleTags: string[] }[] = [];
  for (const w of webp) {
    const key = `products/${keyBase}/${w.filename}.webp`;
    const url = await uploadWebpToR2(r2, bucket, key, w.buffer);
    uploaded.push({
      url,
      filename: w.filename,
      styleTags: styleMap[w.filename] ?? [],
    });
    log(`uploaded → ${url}`);
  }

  // 4. Upload primary video if present, recording where it sits in the gallery
  //    so the combined media order matches the seller's folder numbering.
  let videoUrl: string | null = null;
  let videoPosition: number | null = null;
  const folderBasename = path.basename(folder.absPath);
  const primaryVideo = pickPrimaryVideo(folder.videoFiles, folderBasename);
  if (primaryVideo) {
    const ext = path.extname(primaryVideo).toLowerCase();
    const contentType = VIDEO_CONTENT_TYPES[ext] ?? "video/mp4";
    const body = fs.readFileSync(primaryVideo);
    const key = `products/${keyBase}/video${ext}`;
    videoUrl = await uploadVideoToR2(r2, bucket, key, body, contentType);
    videoPosition = videoSlotIndex(folder.imageFiles, primaryVideo);
    log(`uploaded video → ${videoUrl} (slot ${videoPosition})`);
  }

  // 5. Insert product + children into Neon as a draft.
  const slug = await uniqueSlug(slugify(copy.title));
  const collectionTag = folder.categoryHint.split(" / ")[0]?.toLowerCase();
  const tags = Array.from(
    new Set([...copy.tags, collectionTag].filter(Boolean) as string[]),
  );

  const [product] = await db
    .insert(products)
    .values({
      slug,
      title: copy.title,
      description: copy.description,
      price: String(type.getBasePrice(currency)),
      currency,
      materials: copy.materials || null,
      tags,
      status: "draft",
      sourceShops: "local",
      productType: type.id,
      videoUrl,
      videoPosition,
      sourceFolder: folder.folderPath,
      aiModel: process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini",
    })
    .returning({ id: products.id });

  await db.insert(productImages).values(
    uploaded.map((u, idx) => ({
      productId: product.id,
      url: u.url,
      position: idx,
      altText: idx === 0 ? copy.altText : null,
      aiAnalyzed: true,
      styleTags: u.styleTags,
      sourceFilename: u.filename,
    })),
  );

  if (type.options.length > 0) {
    await db.insert(productOptions).values(
      type.options.map((opt, position) => ({
        productId: product.id,
        name: opt.name,
        position,
        values: opt.values,
      })),
    );
  }

  // 6. Auto-classify into collections from the product's text signals
  //    (tags + title + source folder). Membership rows are best-effort: a
  //    missing/un-seeded collection simply isn't linked. Run `npm run
  //    seed:collections` so the matched slugs exist.
  await assignCollections(product.id, {
    tags,
    title: copy.title,
    sourceFolder: folder.folderPath,
    log,
  });

  return {
    productId: product.id,
    slug,
    title: copy.title,
    imageCount: uploaded.length,
    hasVideo: Boolean(videoUrl),
  };
}

/**
 * AI image ingestion pipeline.
 *
 *   npm run ingest:images -- "C:\\path\\to\\images"
 *
 * Behavior:
 *  - If the target directory contains subfolders, each subfolder is treated as
 *    ONE product (all images inside it form the gallery).
 *  - Otherwise, each image file in the directory is treated as its own product.
 *
 * For each product: upload images to Cloudinary -> ask GPT vision for
 * title/description/tags/price -> insert into Postgres as a `draft` product
 * (so a human can review in the admin panel before publishing).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs";
import path from "node:path";
import { v2 as cloudinary } from "cloudinary";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { generateProductCopy, slugify } from "../src/lib/ai";

const { products, productImages } = schema;

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function isImage(file: string): boolean {
  return IMAGE_EXTS.has(path.extname(file).toLowerCase());
}

type ProductGroup = { name: string; files: string[] };

function collectGroups(dir: string): ProductGroup[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const subdirs = entries.filter((e) => e.isDirectory());

  if (subdirs.length > 0) {
    return subdirs
      .map((d) => {
        const full = path.join(dir, d.name);
        const files = fs
          .readdirSync(full)
          .filter(isImage)
          .map((f) => path.join(full, f))
          .sort();
        return { name: d.name, files };
      })
      .filter((g) => g.files.length > 0);
  }

  // Flat folder: one product per image.
  return entries
    .filter((e) => e.isFile() && isImage(e.name))
    .map((e) => ({
      name: path.parse(e.name).name,
      files: [path.join(dir, e.name)],
    }));
}

async function uploadToCloudinary(filePath: string, folder: string): Promise<{
  url: string;
  publicId: string;
}> {
  const res = await cloudinary.uploader.upload(filePath, {
    folder: `y2kase/${folder}`,
    resource_type: "image",
    overwrite: false,
    unique_filename: true,
  });
  return { url: res.secure_url, publicId: res.public_id };
}

async function uniqueSlug(
  db: ReturnType<typeof drizzle<typeof schema>>,
  base: string,
): Promise<string> {
  let slug = base || "product";
  let n = 1;
  // eslint-disable-next-line no-constant-condition
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

async function main() {
  const targetDir = process.argv[2] ?? process.env.INGEST_DIR;
  if (!targetDir) {
    throw new Error(
      'Provide an image directory: npm run ingest:images -- "C:\\path\\to\\images"',
    );
  }
  const resolved = path.resolve(targetDir);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Directory not found: ${resolved}`);
  }

  const databaseUrl = requireEnv("DATABASE_URL");
  requireEnv("OPENAI_API_KEY");
  cloudinary.config({
    cloud_name: requireEnv("CLOUDINARY_CLOUD_NAME"),
    api_key: requireEnv("CLOUDINARY_API_KEY"),
    api_secret: requireEnv("CLOUDINARY_API_SECRET"),
  });

  const db = drizzle(neon(databaseUrl), { schema });

  const groups = collectGroups(resolved);
  console.log(`Found ${groups.length} product group(s) in ${resolved}`);

  let created = 0;
  for (const [i, group] of groups.entries()) {
    console.log(`\n[${i + 1}/${groups.length}] ${group.name} (${group.files.length} image(s))`);

    try {
      const folderSlug = slugify(group.name) || `batch-${i + 1}`;
      const uploaded: { url: string; publicId: string }[] = [];
      for (const file of group.files) {
        const up = await uploadToCloudinary(file, folderSlug);
        uploaded.push(up);
        console.log(`  uploaded -> ${up.url}`);
      }

      const copy = await generateProductCopy(uploaded.map((u) => u.url));
      console.log(`  AI title: ${copy.title}`);

      const slug = await uniqueSlug(db, slugify(copy.title));

      const [product] = await db
        .insert(products)
        .values({
          slug,
          title: copy.title,
          description: copy.description,
          price: String(copy.suggestedPriceUsd),
          currency: process.env.NEXT_PUBLIC_STORE_CURRENCY ?? "USD",
          tags: copy.tags,
          status: "draft", // review before publishing
          aiModel: process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini",
        })
        .returning({ id: products.id });

      await db.insert(productImages).values(
        uploaded.map((u, idx) => ({
          productId: product.id,
          url: u.url,
          cloudinaryPublicId: u.publicId,
          position: idx,
          altText: copy.altText,
          aiAnalyzed: true,
        })),
      );

      created++;
      console.log(`  created draft product #${product.id} (${slug})`);
    } catch (err) {
      console.error(`  FAILED for "${group.name}":`, err);
    }
  }

  console.log(`\nDone. Created ${created} draft product(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Dump active Sanrio iPhone cases for the eBay UED importer.
 * Writes JSON to the path in argv[2] (no secrets).
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";

config({ path: path.join(process.cwd(), ".env.local") });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

const outPath = process.argv[2];
if (!outPath) throw new Error("Usage: dump-sanrio-iphone-catalog.mjs <out.json>");

const sql = neon(process.env.DATABASE_URL);
const products = await sql`
  SELECT p.id, p.slug, p.title, p.status, p.product_type, p.brand_name, p.character_name,
         p.tags, p.colors, p.motifs, p.video_url, p.source_folder
  FROM products p
  WHERE p.product_type = 'iphone_case'
    AND p.status = 'active'
    AND (
      LOWER(COALESCE(p.brand_name,'')) = 'sanrio'
      OR EXISTS (
        SELECT 1
        FROM product_collections pc
        JOIN collections c ON c.id = pc.collection_id
        LEFT JOIN collections root ON root.id = COALESCE(c.parent_id, c.id)
        WHERE pc.product_id = p.id
          AND (c.slug = 'sanrio' OR root.slug = 'sanrio')
      )
    )
  ORDER BY p.id
`;

const ids = products.map((p) => p.id);
const options = await sql`
  SELECT product_id, name, values, position
  FROM product_options
  WHERE product_id = ANY(${ids})
  ORDER BY product_id, position
`;
const images = await sql`
  SELECT product_id, url, position, source_filename, style_tags
  FROM product_images
  WHERE product_id = ANY(${ids})
  ORDER BY product_id, position
`;

const optionByProduct = new Map();
for (const row of options) {
  const list = optionByProduct.get(row.product_id) ?? [];
  list.push({ name: row.name, values: row.values });
  optionByProduct.set(row.product_id, list);
}
const imageByProduct = new Map();
for (const row of images) {
  const list = imageByProduct.get(row.product_id) ?? [];
  list.push({
    url: row.url,
    position: row.position,
    source_filename: row.source_filename,
  });
  imageByProduct.set(row.product_id, list);
}

const payload = {
  dumpedAt: new Date().toISOString(),
  count: products.length,
  products: products.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    brand_name: p.brand_name,
    character_name: p.character_name,
    tags: p.tags,
    colors: p.colors,
    motifs: p.motifs,
    video_url: p.video_url,
    source_folder: p.source_folder,
    options: optionByProduct.get(p.id) ?? [],
    images: imageByProduct.get(p.id) ?? [],
  })),
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);

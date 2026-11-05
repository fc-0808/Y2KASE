/**
 * 360px copies of the collection covers for the catalog look rail.
 *
 *   npx tsx scripts/build-collection-rail.ts
 *
 * The hero files stay 1024px for the homepage. The rail tile is ~100px, and
 * image optimization is off, so the browser would otherwise download the hero.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SRC = path.join(process.cwd(), "public", "brand", "collections");
const OUT = path.join(process.cwd(), "public", "brand", "collection-rail");
const WIDTH = 360;

export async function buildCollectionRail(): Promise<{
  count: number;
  before: number;
  after: number;
}> {
  fs.mkdirSync(OUT, { recursive: true });
  const files = fs.readdirSync(SRC).filter((file) => file.endsWith(".webp"));
  let before = 0;
  let after = 0;
  for (const file of files) {
    const input = path.join(SRC, file);
    const output = path.join(OUT, file);
    before += fs.statSync(input).size;
    await sharp(input)
      .resize({ width: WIDTH, withoutEnlargement: true })
      .webp({ quality: 72, effort: 4 })
      .toFile(output);
    after += fs.statSync(output).size;
  }
  for (const file of fs.readdirSync(OUT)) {
    if (file.endsWith(".webp") && !files.includes(file)) {
      fs.unlinkSync(path.join(OUT, file));
    }
  }
  return { count: files.length, before, after };
}

const entry = process.argv[1]?.replaceAll("\\", "/");
if (entry?.endsWith("scripts/build-collection-rail.ts")) {
  buildCollectionRail()
    .then(({ count, before, after }) => {
      console.log(
        `collection rail: ${count} tiles, ${before} bytes → ${after} bytes`,
      );
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}

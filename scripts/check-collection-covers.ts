/**
 * Collection-cover invariants for the homepage "Shop the universe" rail.
 *
 * Featured collections that are not rail-hidden must ship a pixel cover. The
 * Originals tile previously rendered as a blank gradient because it was in the
 * taxonomy, on the rail, and missing from both the theme table and the
 * generated-asset set — a silent degradation the CategoryRail is designed to
 * allow (missing art falls back) and therefore must be guarded against here.
 *
 *   tsx scripts/check-collection-covers.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  flattenTaxonomy,
  ORIGINALS_SLUG,
  RAIL_HIDDEN_SLUGS,
} from "../src/lib/catalog/collections-config";
import {
  COLLECTION_COVER_SLUGS,
  collectionCoverSrc,
} from "../src/lib/brand/collection-covers";
import { hasBespokeCoverTheme, buildCollectionCoverPrompt } from "./lib/collection-cover-themes";

const COVER_DIR = path.join(process.cwd(), "public", "brand", "collections");

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): void {
  tests.push({ name, fn });
}

const tests: { name: string; fn: () => void | Promise<void> }[] = [];

/** Featured + feature tiles that are not rail-hidden. Genre umbrellas like
 *  Anime stay out via RAIL_HIDDEN_SLUGS; MagSafe and Originals stay in. */
function requiredRailCoverCollections() {
  return flattenTaxonomy().filter(
    (n) =>
      !RAIL_HIDDEN_SLUGS.has(n.slug) &&
      (n.featured === true || n.kind === "feature"),
  );
}

function coverFile(slug: string): string {
  return path.join(COVER_DIR, `${slug}.webp`);
}

test("Originals is featured and not rail-hidden", () => {
  const originals = flattenTaxonomy().find((n) => n.slug === ORIGINALS_SLUG);
  assert.ok(originals, "Originals must exist in the taxonomy");
  assert.equal(originals.featured, true);
  assert.equal(RAIL_HIDDEN_SLUGS.has(ORIGINALS_SLUG), false);
});

test("every featured/feature rail collection has a bespoke pixel theme", () => {
  const missing = requiredRailCoverCollections()
    .map((n) => n.slug)
    .filter((slug) => !hasBespokeCoverTheme(slug));
  assert.deepEqual(
    missing,
    [],
    `featured rail tiles missing a cover theme: ${missing.join(", ")}`,
  );
});

test("every featured/feature rail collection has a generated cover on disk and in the manifest", () => {
  const missing: string[] = [];
  for (const node of requiredRailCoverCollections()) {
    if (!COLLECTION_COVER_SLUGS.has(node.slug)) missing.push(`${node.slug} (manifest)`);
    if (!fs.existsSync(coverFile(node.slug))) missing.push(`${node.slug} (file)`);
  }
  assert.deepEqual(missing, [], `featured rail tiles missing covers: ${missing.join(", ")}`);
});

test("manifest slugs and cover files are a bijection", () => {
  const onDisk = fs
    .readdirSync(COVER_DIR)
    .filter((f) => f.endsWith(".webp"))
    .map((f) => f.replace(/\.webp$/, ""))
    .sort();
  const inManifest = [...COLLECTION_COVER_SLUGS].sort();
  assert.deepEqual(
    onDisk,
    inManifest,
    "public/brand/collections/*.webp must match COLLECTION_COVER_SLUGS — re-run npm run covers:generate",
  );
});

test("Originals cover prompt spells the wordmark and forbids licensed faces", () => {
  const prompt = buildCollectionCoverPrompt("Originals", ORIGINALS_SLUG);
  assert.match(prompt, /O-R-I-G-I-N-A-L-S/);
  assert.match(prompt, /no blobs with faces/i);
  assert.match(prompt, /#7ec8ff/);
});

test("cover URLs are cache-busted public paths", () => {
  const src = collectionCoverSrc(ORIGINALS_SLUG);
  assert.match(src, /^\/brand\/collections\/originals\.webp\?v=/);
});

test("no rail-hidden collection still has a cover file", () => {
  const leaked = [...RAIL_HIDDEN_SLUGS].filter((slug) =>
    fs.existsSync(coverFile(slug)),
  );
  assert.deepEqual(leaked, [], `hidden collections still have covers: ${leaked.join(", ")}`);
});

async function assertCoverAsset(slug: string): Promise<void> {
  const file = coverFile(slug);
  const meta = await sharp(file).metadata();
  assert.equal(meta.format, "webp", `${slug} must be WebP`);
  assert.ok(
    (meta.width ?? 0) >= 640,
    `${slug} is too narrow (${meta.width}px) for a retina rail tile`,
  );
  assert.ok(
    (meta.height ?? 0) >= 360,
    `${slug} is too short (${meta.height}px) for a 16:9 rail tile`,
  );
  const ratio = (meta.width ?? 0) / (meta.height ?? 1);
  assert.ok(
    Math.abs(ratio - 16 / 9) < 0.08,
    `${slug} aspect ${ratio.toFixed(3)} is not ~16:9`,
  );
}

test("every shipped cover is a valid ~16:9 WebP", async () => {
  for (const slug of COLLECTION_COVER_SLUGS) {
    await assertCoverAsset(slug);
  }
});

async function main() {
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
    } catch (err) {
      failed += 1;
      console.error(`  ✗ ${name}`);
      console.error(err instanceof Error ? err.stack : err);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} collection-cover check(s) failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`Collection-cover invariants passed (${passed}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

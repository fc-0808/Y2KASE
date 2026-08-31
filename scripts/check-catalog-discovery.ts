/**
 * Filesystem regression checks for catalog folder discovery.
 *
 * These run without a test framework and use an isolated OS temp directory.
 * The fixtures are filename-only because discovery must never decode pixels;
 * Sharp validates the actual files later, before anything reaches storage.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  discoverProductFolders,
  inspectProductFolders,
  isInternalMediaDirectory,
} from "../src/lib/catalog/discover";
import {
  catalogImageObjectName,
  catalogMediaKeyBase,
  catalogVideoObjectName,
} from "../src/lib/catalog/media-key";

let passed = 0;
let failed = 0;

function test(name: string, fn: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "y2kase-discovery-"));
  try {
    fn(root);
    passed += 1;
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(err instanceof Error ? err.stack : err);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function file(root: string, relative: string): void {
  const absolute = path.join(root, ...relative.split("/"));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, "");
}

test("a flat product keeps every direct image in natural order", (root) => {
  file(root, "Miffy/sku-1/10.jpg");
  file(root, "Miffy/sku-1/2.PNG");
  file(root, "Miffy/sku-1/1.webp");

  const folders = discoverProductFolders(root);
  assert.equal(folders.length, 1);
  assert.equal(folders[0].folderPath, "Miffy/sku-1");
  assert.deepEqual(
    folders[0].imageFiles.map((name) => path.basename(name)),
    ["1.webp", "2.PNG", "10.jpg"],
  );
});

test("selecting one product folder directly gives it a non-empty identity", (root) => {
  file(root, "1.jpg");
  file(root, "2.jpg");

  const folders = discoverProductFolders(root);
  assert.equal(folders.length, 1);
  assert.equal(folders[0].folderPath, path.basename(root));
  assert.equal(folders[0].categoryHint, path.basename(root));
});

test("a category with several product children is not itself a product", (root) => {
  file(root, "Sanrio/category-cover.jpg");
  file(root, "Sanrio/hello-kitty/1.jpg");
  file(root, "Sanrio/kuromi/1.jpg");

  const folders = discoverProductFolders(root);
  assert.deepEqual(
    folders.map((folder) => folder.folderPath),
    ["Sanrio/hello-kitty", "Sanrio/kuromi"],
  );
});

test("variant helper folders never become one-image products", (root) => {
  file(root, "foo_variants/01_front.jpg");
  file(root, "foo_variants/02_three_quarter.jpg");
  file(root, "foo_variants/variants.json");
  file(root, "foo_variants/_originals/original_07.jpg");
  file(root, "foo_variants/_removed/rejected.jpg");

  const report = inspectProductFolders(root);
  assert.equal(report.folders.length, 1);
  assert.equal(report.folders[0].folderPath, "foo_variants");
  assert.deepEqual(
    report.folders[0].imageFiles.map((name) => path.basename(name)),
    ["01_front.jpg", "02_three_quarter.jpg"],
  );
  assert.deepEqual(
    report.ignoredMediaDirectories.map((folder) => folder.folderPath),
    ["foo_variants/_originals", "foo_variants/_removed"],
  );
  assert.equal(report.ignoredImageCount, 2);
});

test("helper directories are ignored even without a variants manifest", (root) => {
  file(root, "foo/hero.jpg");
  file(root, "foo/_ORIGINALS/backup.jpg");
  file(root, "foo/_removed/rejected.jpg");

  const report = inspectProductFolders(root);
  assert.deepEqual(
    report.folders.map((folder) => folder.folderPath),
    ["foo"],
  );
  assert.equal(report.folders[0].imageFiles.length, 1);
  assert.equal(report.ignoredImageCount, 2);
});

test("a helper-only workspace is reported but never ingested", (root) => {
  file(root, "unfinished_variants/variants.json");
  file(root, "unfinished_variants/_originals/only.jpg");

  const report = inspectProductFolders(root);
  assert.equal(report.folders.length, 0);
  assert.equal(report.ignoredMediaDirectories.length, 1);
  assert.equal(report.ignoredImageCount, 1);
});

test("selecting a helper directory itself can never make it a product", (root) => {
  const helperRoot = path.join(root, "_originals");
  file(root, "_originals/only.jpg");

  const report = inspectProductFolders(helperRoot);
  assert.equal(report.folders.length, 0);
  assert.deepEqual(report.ignoredMediaDirectories, [
    { folderPath: "_originals", imageCount: 1 },
  ]);
  assert.equal(report.ignoredImageCount, 1);
});

test("real nested product directories still beat loose parent media", (root) => {
  file(root, "Supplier/loose-reference.jpg");
  file(root, "Supplier/2026/SKU-100/1.jpg");

  const folders = discoverProductFolders(root);
  assert.deepEqual(
    folders.map((folder) => folder.folderPath),
    ["Supplier/2026/SKU-100"],
  );
});

test("only the two explicit generator helper names are reserved", () => {
  assert.equal(isInternalMediaDirectory("_originals"), true);
  assert.equal(isInternalMediaDirectory("_ORIGINALS"), true);
  assert.equal(isInternalMediaDirectory("_removed"), true);
  assert.equal(isInternalMediaDirectory("_review"), false);
  assert.equal(isInternalMediaDirectory("originals"), false);
});

test("different Chinese folders cannot collapse onto one R2 prefix", () => {
  const first = catalogMediaKeyBase("磁吸亮面猫咪");
  const second = catalogMediaKeyBase("磁吸磨砂兔子");
  assert.notEqual(first, second);
  assert.match(first, /^product-[a-f0-9]{12}$/);
  assert.match(second, /^product-[a-f0-9]{12}$/);
  assert.equal(catalogMediaKeyBase("磁吸亮面猫咪"), first);
  assert.notEqual(
    catalogMediaKeyBase("1", "C:\\supplier-a\\1"),
    catalogMediaKeyBase("1", "D:\\supplier-b\\1"),
  );
});

test("media object names are safe, ordered, and extension-collision resistant", () => {
  const jpg = catalogImageObjectName("产品图/1.jpg", 0);
  const png = catalogImageObjectName("产品图/1.png", 1);
  assert.match(jpg, /^001-1-[a-f0-9]{12}\.webp$/);
  assert.match(png, /^002-1-[a-f0-9]{12}\.webp$/);
  assert.notEqual(jpg, png);
  assert.match(
    catalogVideoObjectName("产品视频.MOV"),
    /^video-media-[a-f0-9]{12}\.mov$/,
  );
});

console.log(
  failed === 0
    ? `\n  ✓ catalog-discovery: ${passed} checks passed\n`
    : `\n  ✗ catalog-discovery: ${failed} failed, ${passed} passed\n`,
);
process.exit(failed === 0 ? 0 : 1);

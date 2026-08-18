import assert from "node:assert/strict";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const chunksRoot = path.resolve(".next/static/chunks/app");

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(absolute) : [absolute];
    }),
  );
  return nested.flat();
}

const relative = (file: string) =>
  path.relative(chunksRoot, file).replaceAll(path.sep, "/");

const budgets = [
  { name: "root layout", pattern: /^layout-[\w-]+\.js$/, maxBytes: 15_000 },
  {
    name: "storefront layout",
    pattern: /^\(storefront\)\/layout-[\w-]+\.js$/,
    maxBytes: 5_000,
  },
  {
    name: "checkout layout",
    pattern: /^\(checkout\)\/layout-[\w-]+\.js$/,
    maxBytes: 3_000,
  },
  {
    name: "homepage",
    pattern: /^\(storefront\)\/page-[\w-]+\.js$/,
    maxBytes: 20_000,
  },
  {
    name: "product detail",
    pattern: /^\(storefront\)\/products\/\[slug\]\/page-[\w-]+\.js$/,
    maxBytes: 40_000,
  },
  {
    name: "cart",
    pattern: /^\(checkout\)\/cart\/page-[\w-]+\.js$/,
    maxBytes: 30_000,
  },
] as const;

async function main(): Promise<void> {
  const files = await filesUnder(chunksRoot);
  for (const budget of budgets) {
    const matches = files.filter((file) => budget.pattern.test(relative(file)));
    assert.equal(matches.length, 1, `${budget.name} chunk must exist exactly once`);
    const bytes = (await stat(matches[0])).size;
    assert.ok(
      bytes <= budget.maxBytes,
      `${budget.name} chunk is ${bytes} bytes; budget is ${budget.maxBytes}`,
    );
  }
  console.log("✓ storefront bundle budgets passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

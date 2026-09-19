/**
 * Storefront cache / ISR contract.
 *
 *   tsx scripts/check-cache-policy.ts
 *
 * Failure modes this guards:
 *  - Faceted catalog URLs (`?color=&motif=&page=`) entering durable ISR. Each
 *    combo is a unique 8 KB write unit; crawlers filled Hobby's 200K budget.
 *  - Timed ISR (`export const revalidate = 86400`) trying to persist pages
 *    after Hobby writes are exhausted — uncached URLs 500 for new visitors.
 *  - `revalidatePath("/products/[slug]", "page")` marking every PDP stale.
 *  - Timed Data Cache (`revalidate: 300|3600`) rewriting unchanged payloads.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DATA_CACHE_REVALIDATE,
} from "../src/lib/cache";
import {
  CANONICAL_CDN_CACHE_CONTROL,
  CANONICAL_CDN_MAX_AGE_SECONDS,
  FACETED_CDN_CACHE_CONTROL,
  FACETED_CDN_MAX_AGE_SECONDS,
  FEED_CDN_CACHE_CONTROL,
  OG_CDN_CACHE_CONTROL,
} from "../src/lib/cache-headers";
import { isDurableCatalogQuery } from "../src/lib/products";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(err instanceof Error ? err.stack : err);
  }
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".next") continue;
    const path = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkTs(path));
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(path);
  }
  return out;
}

function liveLines(src: string, predicate: (line: string) => boolean): string[] {
  return src.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*")
    ) {
      return false;
    }
    return predicate(line);
  });
}

const FORCE_DYNAMIC_STOREFRONT = [
  "src/app/(storefront)/page.tsx",
  "src/app/(storefront)/products/[slug]/page.tsx",
  "src/app/(storefront)/collections/page.tsx",
  "src/app/(storefront)/insights/page.tsx",
  "src/app/(storefront)/blog/page.tsx",
  "src/app/(storefront)/blog/[slug]/page.tsx",
  "src/app/(storefront)/blog/rss.xml/route.ts",
  "src/app/(storefront)/products/[slug]/opengraph-image.tsx",
  "src/app/(storefront)/collections/[slug]/opengraph-image.tsx",
  "src/app/(storefront)/devices/[slug]/opengraph-image.tsx",
  "src/app/sitemap.ts",
  "src/app/llms.txt/route.ts",
  "src/app/(storefront)/products/page.tsx",
  "src/app/(storefront)/collections/[slug]/page.tsx",
  "src/app/(storefront)/devices/[slug]/page.tsx",
];

const BLAST_PATHS = [
  "/products/[slug]",
  "/devices/[slug]",
  "/collections/[slug]",
];

test("Data Cache is event-driven and storefront HTML uses CDN not ISR", () => {
  assert.equal(DATA_CACHE_REVALIDATE, false);
  assert.equal(FACETED_CDN_MAX_AGE_SECONDS, 120);
  assert.equal(CANONICAL_CDN_MAX_AGE_SECONDS, 3_600);
  assert.match(FACETED_CDN_CACHE_CONTROL, /s-maxage=120/);
  assert.match(CANONICAL_CDN_CACHE_CONTROL, /s-maxage=3600/);
  assert.match(FEED_CDN_CACHE_CONTROL, /s-maxage=3600/);
  assert.match(OG_CDN_CACHE_CONTROL, /s-maxage=86400/);
});

test("cachedCatalogRead defaults to event-driven Data Cache and survives ISR quota", () => {
  const src = read("src/lib/cache.ts");
  assert.match(
    src,
    /revalidate:\s*options\.revalidate\s*\?\?\s*DATA_CACHE_REVALIDATE/,
  );
  assert.match(src, /revalidateTag\(CACHE_TAGS\.products,\s*"max"\)/);
  assert.match(src, /function isDurableCacheUnavailable/);
});

for (const file of FORCE_DYNAMIC_STOREFRONT) {
  test(`${file} is force-dynamic and has no ISR timer`, () => {
    const src = read(file);
    assert.match(src, /export const dynamic = "force-dynamic"/);
    assert.doesNotMatch(src, /export const revalidate/);
  });
}

test("next.config sets targeted CDN headers for storefront routes and feeds", () => {
  const src = read("next.config.ts");
  assert.match(src, /FACETED_CDN_CACHE_CONTROL/);
  assert.match(src, /CANONICAL_CDN_CACHE_CONTROL/);
  assert.match(src, /FEED_CDN_CACHE_CONTROL/);
  assert.match(src, /Vercel-CDN-Cache-Control/);
  assert.match(src, /source:\s*"\/"/);
  assert.match(src, /source:\s*"\/products\/:slug"/);
  assert.match(src, /source:\s*"\/products"/);
  assert.match(src, /source:\s*"\/collections\/:slug"/);
  assert.match(src, /source:\s*"\/devices\/:slug"/);
  assert.match(src, /source:\s*"\/feed\.xml"/);
  assert.match(src, /source:\s*"\/api\/feed\/pinterest"/);
  assert.match(src, /source:\s*"\/sitemap\.xml"/);
  const rssIdx = src.indexOf('source: "/blog/rss.xml"');
  const slugIdx = src.indexOf('source: "/blog/:slug"');
  assert.ok(rssIdx >= 0 && slugIdx >= 0 && rssIdx < slugIdx);
});

test("only canonical page-1 listings occupy durable catalog Data Cache", () => {
  assert.equal(isDurableCatalogQuery({ page: 1, sort: "newest" }), true);
  assert.equal(
    isDurableCatalogQuery({ page: 1, sort: "newest", collection: "sanrio" }),
    true,
  );
  assert.equal(
    isDurableCatalogQuery({ page: 1, sort: "newest", device: "iphone" }),
    true,
  );
  assert.equal(isDurableCatalogQuery({ page: 2, sort: "newest" }), false);
  assert.equal(isDurableCatalogQuery({ page: 1, sort: "price-asc" }), false);
  assert.equal(
    isDurableCatalogQuery({ page: 1, sort: "newest", colors: ["pink"] }),
    false,
  );
  assert.equal(
    isDurableCatalogQuery({ page: 1, sort: "newest", search: "kitty" }),
    false,
  );
  const products = read("src/lib/products.ts");
  assert.match(products, /export function isDurableCatalogQuery/);
  assert.match(products, /isDurableCatalogQuery\(normalized\)/);
});

test("proxy matcher stays admin-only so shoppers skip Node CPU", () => {
  const src = read("src/proxy.ts");
  assert.match(src, /matcher:\s*\["\/admin\/:path\*"\]/);
});

test("admin mutations do not blast every PDP via a dynamic segment", () => {
  const hits: string[] = [];
  for (const file of walkTs("src")) {
    const src = read(file);
    for (const path of BLAST_PATHS) {
      const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`revalidatePath\\(\\s*["'\`]${escaped}`);
      for (const line of liveLines(src, (l) => pattern.test(l))) {
        hits.push(`${file}: ${line.trim()}`);
      }
    }
  }
  assert.deepEqual(hits, []);
});

test("Data Cache wrappers do not use short time-based revalidate", () => {
  const hits: string[] = [];
  for (const file of walkTs("src/lib")) {
    const src = read(file);
    for (const line of liveLines(src, (l) =>
      /revalidate:\s*(300|3600|60|120)\b/.test(l),
    )) {
      hits.push(`${file}: ${line.trim()}`);
    }
  }
  assert.deepEqual(hits, []);
});

test("no leftover timed ISR segment config on app routes", () => {
  const hits: string[] = [];
  for (const file of [...walkTs("src/app"), "src/lib/cache.ts"]) {
    const src = read(file);
    for (const line of liveLines(src, (l) =>
      /export const revalidate = (3600|86400)/.test(l),
    )) {
      hits.push(`${file}: ${line.trim()}`);
    }
  }
  assert.deepEqual(hits, []);
});

test("storefront invalidation does not persist ISR paths", () => {
  const cache = read("src/lib/cache.ts");
  assert.match(cache, /export function revalidateStorefrontProduct/);
  assert.match(cache, /revalidateStorefrontCatalog\(\)/);
  const pathWrites = liveLines(cache, (l) => /revalidatePath\(/.test(l));
  assert.deepEqual(pathWrites, []);
  const blast = liveLines(cache, (l) =>
    /revalidatePath\(\s*["'`]\/products\/\[slug\]/.test(l),
  );
  assert.deepEqual(blast, []);

  const products = read("src/lib/products.ts");
  assert.match(products, /export async function getProductSlugById/);

  const reviews = read("src/lib/reviews.ts");
  assert.match(reviews, /export async function getReviewProductRef/);
});

test("insights snapshot time is catalog data, not wall clock", () => {
  const src = read("src/lib/seo/catalog-insights.ts");
  assert.doesNotMatch(src, /generatedAt:\s*new Date\(\)\.toISOString\(\)/);
  assert.match(src, /max\(\$\{products\.updatedAt\}\)/);
});

if (failed > 0) {
  console.error(`\n${failed} cache-policy check(s) failed, ${passed} passed`);
  process.exit(1);
}

console.log(`✓ cache-policy invariants passed (${passed})`);

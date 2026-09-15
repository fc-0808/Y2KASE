/**
 * Storefront catalog-image URL invariants.
 *
 *   tsx scripts/check-storefront-media.ts
 *
 * Guards the predicate that keeps retired numeric-id R2 keys (HTTP 404) off
 * the product page gallery and listing cards. If this drifts, the PDP paints
 * a strip of broken-image icons again.
 */
import assert from "node:assert/strict";

import {
  isCatalogHttpUrl,
  isRetiredCatalogObjectUrl,
  isStorefrontRenderableUrl,
  selectStorefrontImages,
  storefrontHeroUrl,
  storefrontVideoUrl,
} from "../src/lib/catalog/storefront-media";
import {
  canonicalizePublicR2Url,
  LEGACY_R2_PUBLIC_ORIGIN,
  PRODUCTION_R2_PUBLIC_ORIGIN,
  r2KeyFromPublicUrl,
} from "../src/lib/catalog/r2-public";

const R2 = LEGACY_R2_PUBLIC_ORIGIN;

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

test("hashed ingest keys remain renderable", () => {
  const url = `${R2}/products/hello-kitty-sticker-fun-iphone-case-with-beaded-strap/001-studio-front-ab12cd34ef56.webp`;
  assert.equal(isCatalogHttpUrl(url), true);
  assert.equal(isRetiredCatalogObjectUrl(url), false);
  assert.equal(isStorefrontRenderableUrl(url), true);
});

test("approved thumbnails remain renderable", () => {
  const cleaned = `${R2}/products/hello-kitty-sticker-fun-iphone-case-with-beaded-strap/thumbnail-cleaned-1785741624053.webp`;
  const proposal = `${R2}/products/sanrio-hello-kitty-lucky-red/thumbnail-proposal-1784693229561.webp`;
  const manual = `${R2}/products/manual/52-nobg-1785726195024.webp`;
  assert.equal(isStorefrontRenderableUrl(cleaned), true);
  assert.equal(isStorefrontRenderableUrl(proposal), true);
  assert.equal(isStorefrontRenderableUrl(manual), true);
});

test("legacy numeric-id objects are retired", () => {
  assert.equal(
    isRetiredCatalogObjectUrl(`${R2}/products/25/1.webp`),
    true,
  );
  assert.equal(
    isStorefrontRenderableUrl(`${R2}/products/25/11.webp`),
    false,
  );
  assert.equal(
    isStorefrontRenderableUrl(`${R2}/products/25/3.jpg`),
    false,
  );
});

test("foreign CDNs stay eligible (existence is not knowable here)", () => {
  assert.equal(
    isStorefrontRenderableUrl(
      "https://i.etsystatic.com/123/listing.jpg",
    ),
    true,
  );
  assert.equal(
    isStorefrontRenderableUrl(
      "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    ),
    true,
  );
});

test("empty, relative and malformed URLs never render", () => {
  assert.equal(isStorefrontRenderableUrl(""), false);
  assert.equal(isStorefrontRenderableUrl("   "), false);
  assert.equal(isStorefrontRenderableUrl(null), false);
  assert.equal(isStorefrontRenderableUrl("/products/25/1.webp"), false);
  assert.equal(isStorefrontRenderableUrl("not a url"), false);
});

test("selectStorefrontImages preserves live order and drops retired rows", () => {
  const hero = `${R2}/products/sku/thumbnail-cleaned-1.webp`;
  const live = `${R2}/products/sku/001-front-aaaaaaaaaaaa.webp`;
  const dead = `${R2}/products/25/1.webp`;
  const selected = selectStorefrontImages([
    { url: hero, position: 0 },
    { url: dead, position: 3 },
    { url: live, position: 4 },
    { url: `${R2}/products/25/4.webp`, position: 5 },
  ]);
  assert.deepEqual(
    selected.map((row) => row.url),
    [hero, live],
  );
});

test("storefrontHeroUrl prefers the first live photo", () => {
  const cleaned = `${R2}/products/sku/thumbnail-cleaned-1.webp`;
  assert.equal(
    storefrontHeroUrl([
      { url: `${R2}/products/9/1.webp` },
      { url: cleaned },
    ]),
    canonicalizePublicR2Url(cleaned),
  );
  assert.equal(
    storefrontHeroUrl([{ url: `${R2}/products/9/1.webp` }]),
    null,
  );
});

test("idempotent on an already-filtered gallery", () => {
  const live = [{ url: `${R2}/products/sku/thumbnail-cleaned-1.webp` }];
  assert.deepEqual(selectStorefrontImages(selectStorefrontImages(live)), live);
});

test("underscore-collapsed prefixes with no objects are retired", () => {
  const deadPhoto = `${R2}/products/________________13_____12____15-17pm__plusair_variants/original_01.webp`;
  const deadVideo = `${R2}/products/__________________13_____12____15-17pm__plusair_variants/video.mp4`;
  const liveNeighbour = `${R2}/products/____________________13_____12____15-17pm__plusair_variants/original_04.webp`;
  assert.equal(isStorefrontRenderableUrl(deadPhoto), false);
  assert.equal(storefrontVideoUrl(deadVideo), null);
  assert.equal(isStorefrontRenderableUrl(liveNeighbour), true);
});

test("legacy r2.dev URLs canonicalize to media.y2kase.com", () => {
  const key =
    "products/hello-kitty-sticker-fun-iphone-case-with-beaded-strap/thumbnail-cleaned-1.webp";
  const legacy = `${R2}/${key}`;
  const live = `${PRODUCTION_R2_PUBLIC_ORIGIN}/${key}`;
  assert.equal(r2KeyFromPublicUrl(legacy), key);
  assert.equal(r2KeyFromPublicUrl(live), key);
  assert.equal(canonicalizePublicR2Url(legacy), live);
  assert.equal(canonicalizePublicR2Url(live), live);
  assert.equal(
    r2KeyFromPublicUrl("https://res.cloudinary.com/demo/image/upload/sample.jpg"),
    null,
  );
  assert.equal(
    storefrontVideoUrl(`${R2}/products/sku/video.mp4`),
    `${PRODUCTION_R2_PUBLIC_ORIGIN}/products/sku/video.mp4`,
  );
});

if (failed > 0) {
  console.error(`\n${failed} storefront-media check(s) failed, ${passed} passed`);
  process.exit(1);
}
console.log(`✓ storefront media invariants passed (${passed})`);

/**
 * Device facet invariants — taxonomy, URL state, MagSafe pairing.
 *
 *   tsx scripts/check-devices.ts
 *
 * The failure mode this guards: AirPods landing in a Hello Kitty grid with no
 * way to split them from iPhone cases, or `?device=airpods&magsafe=true`
 * rendering as an empty page instead of dropping the impossible MagSafe chip.
 */
import assert from "node:assert/strict";

import {
  catalogHasMultipleDevices,
  deviceBrowseHref,
  deviceFilterLabel,
  deviceIsLive,
  deviceOffersMagSafe,
  filterMagSafeCollectionSlugs,
  findDevice,
  isDeviceId,
  productTypeOffersMagSafe,
  rollupDeviceCounts,
  stockedDeviceIds,
} from "../src/lib/catalog/devices";
import { MAGSAFE_SLUG } from "../src/lib/catalog/collections-config";
import { deviceSeo } from "../src/lib/seo/device-content";
import {
  collectionBrowseTagline,
  collectionFilteredTitle,
  collectionProductNoun,
  collectionSeo,
} from "../src/lib/seo/copy";
import { collectionEditorial } from "../src/lib/seo/collection-editorial";
import {
  buildCatalogHref,
  dropIncompatibleFacets,
  parseCatalogParams,
} from "../src/lib/catalog/params";
import { isIndexableCatalogPage } from "../src/lib/seo";
import { bundleStorefrontOffer, BUNDLE } from "../src/lib/promotions";

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

test("known device ids parse; unknown slugs are dropped", () => {
  assert.equal(isDeviceId("iphone"), true);
  assert.equal(isDeviceId("airpods"), true);
  assert.equal(isDeviceId("toaster"), false);
  assert.equal(parseCatalogParams({ device: "airpods" }, "/products").device, "airpods");
  assert.equal(parseCatalogParams({ device: "IPHONE" }, "/products").device, "iphone");
  assert.equal(parseCatalogParams({ device: "toaster" }, "/products").device, undefined);
});

test("AirPods is a real device id whether or not the landing is live", () => {
  assert.ok(findDevice("airpods"));
  assert.equal(
    parseCatalogParams({ device: "airpods" }, "/collections/hello-kitty").device,
    "airpods",
  );
});

test("MagSafe is a phone-case attribute, not an AirPods one", () => {
  assert.equal(deviceOffersMagSafe("iphone"), true);
  assert.equal(deviceOffersMagSafe("galaxy"), true);
  assert.equal(deviceOffersMagSafe("airpods"), false);
  assert.equal(deviceOffersMagSafe("apple-watch"), false);
  assert.equal(deviceOffersMagSafe("kindle"), false);
});

test("an AirPods + MagSafe URL drops MagSafe rather than emptying the grid", () => {
  const params = parseCatalogParams(
    { device: "airpods", magsafe: "true" },
    "/collections/hello-kitty",
  );
  assert.equal(params.device, "airpods");
  assert.equal(params.magsafe, true);
  const next = dropIncompatibleFacets(params);
  assert.equal(next.magsafe, undefined);
  assert.equal(next.device, "airpods");
  assert.notEqual(next, params);
  assert.equal(
    buildCatalogHref(next),
    "/collections/hello-kitty?device=airpods",
  );
});

test("iPhone + MagSafe is a valid pairing and is left alone", () => {
  const params = parseCatalogParams(
    { device: "iphone", magsafe: "true" },
    "/products",
  );
  assert.equal(dropIncompatibleFacets(params), params);
});

test("product-type counts roll up to device ids and ignore unknown types", () => {
  const counts = rollupDeviceCounts([
    { productType: "iphone_case", count: 10 },
    { productType: "airpod_case", count: 4 },
    { productType: "airpod_case", count: 1 },
    { productType: "phone_charm", count: 3 },
  ]);
  assert.deepEqual(counts, { iphone: 10, airpods: 5 });
  assert.deepEqual(stockedDeviceIds(counts), ["iphone", "airpods"]);
  assert.equal(catalogHasMultipleDevices(counts), true);
  assert.equal(catalogHasMultipleDevices({ iphone: 12 }), false);
  assert.equal(catalogHasMultipleDevices({}), false);
});

test("facet labels and browse hrefs stay in lockstep with the taxonomy", () => {
  assert.equal(deviceFilterLabel("iphone"), "iPhone cases");
  assert.equal(deviceFilterLabel("airpods"), "AirPods cases");
  const iphone = findDevice("iphone")!;
  const airpods = findDevice("airpods")!;
  assert.equal(airpods.comingSoon, undefined);
  assert.equal(deviceBrowseHref(iphone), "/devices/iphone");
  assert.equal(deviceBrowseHref(airpods), "/devices/airpods");
  assert.equal(deviceIsLive(airpods), true);
  assert.equal(deviceIsLive(airpods, {}), false);
  assert.equal(deviceIsLive(airpods, { airpods: 3 }), true);
  assert.equal(deviceIsLive(iphone, { iphone: 12 }), true);
  assert.equal(deviceBrowseHref(airpods, {}), "/products?device=airpods");
  assert.equal(deviceBrowseHref(airpods, { airpods: 3 }), "/devices/airpods");
  const galaxy = findDevice("galaxy")!;
  assert.equal(deviceIsLive(galaxy, { galaxy: 9 }), false);
  assert.equal(deviceBrowseHref(galaxy, { galaxy: 9 }), "/products?device=galaxy");
});

test("collection titles stay on the phone-cases query; the tab and tagline may name AirPods", () => {
  const input = { name: "Hello Kitty", slug: "hello-kitty", kind: "character" };
  const seo = collectionSeo(input);
  assert.equal(seo.heading, "Hello Kitty Phone Cases");
  assert.equal(
    collectionFilteredTitle(input, "airpods"),
    "Hello Kitty AirPods Cases",
  );
  assert.match(
    collectionBrowseTagline(input, ["iphone", "airpods"]),
    /iPhone and AirPods cases/,
  );
  assert.equal(collectionBrowseTagline(input, ["iphone"]), seo.tagline);
  assert.equal(
    collectionBrowseTagline(
      { ...input, description: "Curated by the buyer." },
      ["iphone", "airpods"],
    ),
    "Curated by the buyer.",
  );
  const airpodsOnly = collectionSeo({
    ...input,
    stockedDeviceIds: ["airpods"],
  });
  assert.equal(airpodsOnly.heading, "Hello Kitty AirPods Cases");
  assert.equal(collectionProductNoun(["airpods"], "hello-kitty"), "AirPods Cases");
  assert.equal(collectionProductNoun(["iphone", "airpods"]), "Phone Cases");
  assert.equal(collectionProductNoun(["airpods"], MAGSAFE_SLUG), "Phone Cases");
  assert.equal(
    collectionFilteredTitle(
      { ...input, stockedDeviceIds: ["airpods"] },
      "airpods",
    ),
    "Hello Kitty AirPods Cases",
  );
  assert.match(airpodsOnly.tagline, /AirPods cases/);
  assert.equal(/MagSafe/i.test(airpodsOnly.tagline), false);
});

test("AirPods landing copy is ready the day the line is live", () => {
  const seo = deviceSeo("airpods", "AirPods");
  assert.equal(seo.heading, "AirPods Cases");
  assert.ok(seo.models && seo.models.length > 0);
  assert.ok(seo.faqs.some((faq) => /MagSafe/i.test(faq.answer)));
  assert.ok(seo.faqs.some((faq) => /4 and AirPods 5/i.test(faq.answer)));
});

test("MagSafe collection slugs are refused for AirPods product types", () => {
  assert.equal(productTypeOffersMagSafe("iphone_case"), true);
  assert.equal(productTypeOffersMagSafe("airpod_case"), false);
  assert.deepEqual(
    filterMagSafeCollectionSlugs(
      ["hello-kitty", MAGSAFE_SLUG, "kawaii"],
      "iphone_case",
    ),
    ["hello-kitty", MAGSAFE_SLUG, "kawaii"],
  );
  assert.deepEqual(
    filterMagSafeCollectionSlugs(
      ["hello-kitty", MAGSAFE_SLUG, "kawaii"],
      "airpod_case",
    ),
    ["hello-kitty", "kawaii"],
  );
});

test("collection ?device= URLs are facets, not indexable landings", () => {
  const params = parseCatalogParams(
    { device: "airpods" },
    "/collections/hello-kitty",
  );
  assert.equal(isIndexableCatalogPage(params), false);
  assert.equal(
    isIndexableCatalogPage(parseCatalogParams({}, "/collections/hello-kitty")),
    true,
  );
});

test("an AirPods-stocked collection points at /devices/airpods, not MagSafe, when that is all it sells", () => {
  const mixed = collectionEditorial({
    slug: "hello-kitty",
    name: "Hello Kitty",
    kind: "character",
    parent: { slug: "sanrio", name: "Sanrio" },
    stockedDeviceIds: ["iphone", "airpods"],
  });
  assert.ok(mixed.related.some((link) => link.href === "/devices/airpods"));
  assert.ok(mixed.related.some((link) => link.href === "/collections/magsafe"));

  const only = collectionEditorial({
    slug: "hello-kitty",
    name: "Hello Kitty",
    kind: "character",
    parent: { slug: "sanrio", name: "Sanrio" },
    stockedDeviceIds: ["airpods"],
  });
  assert.ok(only.related.some((link) => link.href === "/devices/airpods"));
  assert.equal(
    only.related.some((link) => link.href === "/collections/magsafe"),
    false,
  );
});

test("the announcement bundle copy covers cases, not only phone cases", () => {
  assert.equal(
    bundleStorefrontOffer(),
    `Buy ${BUNDLE.groupSize} Cases—Pay For ${BUNDLE.groupSize - BUNDLE.freePerGroup}`,
  );
  assert.equal(/Phone Cases/.test(bundleStorefrontOffer()), false);
});

if (failed > 0) {
  console.error(`\n${failed} device check(s) failed, ${passed} passed`);
  process.exit(1);
}
console.log(`✓ ${passed} device facet invariants passed`);

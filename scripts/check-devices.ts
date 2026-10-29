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
import {
  getBasePrice,
  getProductEntryPrice,
  pricedAsIphoneCase,
} from "../src/lib/pricing";
import { listingUnitPrice } from "../src/lib/catalog/custom-styles";

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

test("collection titles name phones, AirPods, or cases to match the stocked mix", () => {
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
  const mixed = collectionSeo({
    ...input,
    stockedDeviceIds: ["iphone", "airpods"],
  });
  assert.equal(mixed.heading, "Hello Kitty Cases");
  assert.match(mixed.description, /Hello Kitty Cases/);
  assert.equal(/Phone Cases/.test(mixed.heading), false);
  const phonesOnly = collectionSeo({
    ...input,
    stockedDeviceIds: ["iphone"],
  });
  assert.equal(phonesOnly.heading, "Hello Kitty Phone Cases");
  const airpodsOnly = collectionSeo({
    ...input,
    stockedDeviceIds: ["airpods"],
  });
  assert.equal(airpodsOnly.heading, "Hello Kitty AirPods Cases");
  assert.equal(collectionProductNoun(["airpods"], "hello-kitty"), "AirPods Cases");
  assert.equal(collectionProductNoun(["iphone", "airpods"]), "Cases");
  assert.equal(collectionProductNoun(["iphone"]), "Phone Cases");
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

test("iPhone landing names the iPhone 18 models shoppers search", () => {
  const seo = deviceSeo("iphone", "iPhone");
  assert.match(seo.intro, /iPhone 18 Pro cases/);
  assert.match(seo.intro, /iPhone 18 Pro Max/);
  assert.match(seo.tagline, /iPhone 18 Pro/);
  assert.equal(/base iPhone 18/.test(seo.intro), true);
  assert.ok(seo.faqs.some((faq) => /iPhone 18/.test(faq.question)));
  assert.equal(seo.models?.includes("iPhone Duo"), false);
  const duo = seo.faqs.find((faq) => /iPhone Duo/.test(faq.question));
  assert.ok(duo, "iPhone landing must say Duo is a different case");
  assert.match(duo.answer, /do not fit/i);
});

test("iPhone Duo is its own device and is not the iPhone case grid", () => {
  const duo = findDevice("iphone-duo");
  assert.ok(duo);
  assert.deepEqual(duo.productTypes, ["iphone_duo_case"]);
  assert.equal(findDevice("iphone")!.productTypes.includes("iphone_duo_case"), false);
  assert.equal(deviceFilterLabel("iphone-duo"), "iPhone Duo cases");
  assert.equal(deviceIsLive(duo, {}), false);
  assert.equal(deviceBrowseHref(duo, {}), "/devices/iphone-duo");
  assert.equal(deviceOffersMagSafe("iphone-duo"), true);
  const seo = deviceSeo("iphone-duo", "iPhone Duo");
  assert.equal(seo.heading, "iPhone Duo Cases");
  assert.match(seo.intro, /does not fit/i);
  assert.match(seo.faqs[1]!.answer, /same as an iPhone case/i);
  assert.equal(productTypeOffersMagSafe("iphone_duo_case"), true);
});

test("magnetic grips are their own section at the iPhone case price", () => {
  const grips = findDevice("magnetic-grips");
  assert.ok(grips);
  assert.deepEqual(grips.productTypes, ["magnetic_grip"]);
  assert.equal(
    findDevice("iphone")!.productTypes.includes("magnetic_grip"),
    false,
  );
  assert.equal(deviceFilterLabel("magnetic-grips"), "Magnetic Grips");
  assert.equal(deviceIsLive(grips, {}), false);
  assert.equal(deviceBrowseHref(grips, {}), "/devices/magnetic-grips");
  assert.equal(deviceOffersMagSafe("magnetic-grips"), false);
  assert.equal(pricedAsIphoneCase("magnetic_grip"), true);
  assert.equal(productTypeOffersMagSafe("magnetic_grip"), false);
  for (const currency of ["USD", "CAD", "HKD", "CNY"]) {
    const casePrice = getBasePrice(currency);
    assert.equal(
      getProductEntryPrice("magnetic_grip", "1.00", currency),
      casePrice,
    );
    assert.equal(
      getProductEntryPrice("iphone_case", "9.00", currency),
      casePrice,
    );
    assert.equal(
      listingUnitPrice({
        productType: "magnetic_grip",
        currency,
        selected: {},
        basePrice: "1.00",
      }),
      casePrice,
    );
  }
  const seo = deviceSeo("magnetic-grips", "Magnetic Grips");
  assert.equal(seo.heading, "Magnetic Grips");
  assert.match(seo.tagline, /same price as an iPhone case/i);
  assert.match(seo.intro, /same price as an iPhone case/i);
  assert.equal(seo.empty?.title, "No magnetic grips yet");
  const copy = JSON.stringify(seo).toLowerCase();
  assert.equal(copy.includes("pop socket"), false);
  assert.equal(copy.includes("popsocket"), false);
  assert.equal(
    collectionProductNoun(["magnetic-grips"]),
    "Magnetic Grips",
  );
  assert.equal(
    collectionFilteredTitle(
      { name: "Hello Kitty", slug: "hello-kitty", kind: "character" },
      "magnetic-grips",
    ),
    "Hello Kitty Magnetic Grips",
  );
  const params = parseCatalogParams(
    { device: "magnetic-grips", magsafe: "true" },
    "/products",
  );
  assert.equal(dropIncompatibleFacets(params).magsafe, undefined);
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

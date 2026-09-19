/**
 * Custom variation invariants — multi-product listings.
 *
 *   tsx scripts/check-custom-styles.ts
 *
 * Guards the failure modes that made Etsy custom variations worth copying
 * carefully: a nameless row surviving sanitisation, a label colliding with
 * "Case + Charm", a custom price being rung up as Case Only, and a photo
 * picker failing to untag the previous linked image.
 */
import assert from "node:assert/strict";

import {
  CUSTOM_STYLE_MAX_LABEL,
  applyCustomImageTags,
  customStyleByLabel,
  customStylePricePresets,
  hydrateCustomStyles,
  imageForStyleSelection,
  isCanonicalPriceValue,
  isDevicePricePreset,
  listingEntryPrice,
  listingUnitPrice,
  mergeOfferedStyleValues,
  minOfferedPrice,
  normalizeCustomStyles,
  recoverCustomImageLinks,
  rewriteTagsAfterCustomEdit,
  setImageVariationTag,
  suggestedCustomStylePrice,
  syncCustomDraftMedia,
  validateCustomStylesDraft,
  variationImage,
} from "../src/lib/catalog/custom-styles";
import { normalizeImageStyleTags, styleTagsFor } from "../src/lib/pricing";

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

const kitty = {
  id: "cs_kitty",
  label: "Hello Kitty + Charm",
  price: 34.99,
  imageId: 11,
};

test("empty and junk input collapse to no custom styles", () => {
  assert.deepEqual(normalizeCustomStyles(null), []);
  assert.deepEqual(normalizeCustomStyles(undefined), []);
  assert.deepEqual(normalizeCustomStyles([{ label: "  ", price: 10 }]), []);
  assert.deepEqual(normalizeCustomStyles([{ label: "Kitty", price: 0 }]), []);
  assert.deepEqual(normalizeCustomStyles([{ label: "Kitty", price: -1 }]), []);
});

test("labels are trimmed, capped, and unique case-insensitively", () => {
  const rows = normalizeCustomStyles([
    { id: "a", label: "  Hello Kitty + Charm  ", price: 34.99, imageId: 1 },
    { id: "b", label: "hello kitty + charm", price: 12, imageId: 2 },
    {
      id: "c",
      label: "x".repeat(CUSTOM_STYLE_MAX_LABEL + 8),
      price: 10,
      imageId: 3,
    },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].label, "Hello Kitty + Charm");
  assert.equal(rows[1].label.length, CUSTOM_STYLE_MAX_LABEL);
});

test("a custom label cannot collide with a canonical bundle", () => {
  assert.deepEqual(
    normalizeCustomStyles(
      [{ label: "Case + Charm", price: 34.99, imageId: 1 }],
      { productType: "airpod_case" },
    ),
    [],
  );
  const invalid = validateCustomStylesDraft(
    [{ label: "Case Only", price: 24.99 }],
    { productType: "iphone_case" },
  );
  assert.equal(invalid.ok, false);
});

test("a named row without a price is an operator error, not silent drop", () => {
  const invalid = validateCustomStylesDraft([{ label: "Kuromi Case Only" }]);
  assert.equal(invalid.ok, false);
  if (invalid.ok) throw new Error("expected failure");
  assert.match(invalid.message, /price/);
  const empty = validateCustomStylesDraft([{ label: "", price: "" }]);
  assert.equal(empty.ok, true);
  if (empty.ok) assert.deepEqual(empty.styles, []);
});

test("unknown image ids are dropped so a stale picker cannot dangle", () => {
  const rows = normalizeCustomStyles(
    [{ label: "Kitty + Charm", price: 34.99, imageId: 99 }],
    { ownedImageIds: new Set([1, 2, 3]) },
  );
  assert.equal(rows[0].imageId, null);
});

test("custom labels survive image-tag normalisation when they are offered", () => {
  const offered = ["Case Only", "Hello Kitty + Charm"];
  assert.deepEqual(
    normalizeImageStyleTags(["Hello Kitty + Charm"], offered),
    ["Hello Kitty + Charm"],
  );
  assert.deepEqual(
    styleTagsFor("Hello Kitty + Charm", offered),
    ["Hello Kitty + Charm"],
  );
  assert.deepEqual(styleTagsFor("Hello Kitty + Charm"), []);
  assert.deepEqual(
    normalizeImageStyleTags(["Case + Charm", "Hello Kitty + Charm"], offered),
    ["Hello Kitty + Charm"],
  );
});

test("canonical tags still beat a custom tag when both are on the photo", () => {
  assert.deepEqual(
    normalizeImageStyleTags(
      ["Hello Kitty + Charm", "Case + Charm"],
      ["Case + Charm", "Hello Kitty + Charm"],
    ),
    ["Case + Charm"],
  );
});

test("dropdown order is canonical bundles, then custom rows", () => {
  assert.deepEqual(
    mergeOfferedStyleValues(["Case Only", "Case + Charm"], [kitty]),
    ["Case Only", "Case + Charm", "Hello Kitty + Charm"],
  );
});

test("listingUnitPrice uses the custom row, never Case Only, for a named product", () => {
  const price = listingUnitPrice({
    productType: "airpod_case",
    currency: "USD",
    selected: { Style: "Hello Kitty + Charm" },
    customStyles: [kitty],
    basePrice: 24.99,
  });
  assert.equal(price, 34.99);
});

test("a canonical Style selection still reads the shared price table", () => {
  const price = listingUnitPrice({
    productType: "airpod_case",
    currency: "USD",
    selected: { Style: "Case Only" },
    customStyles: [kitty],
    basePrice: 24.99,
  });
  assert.equal(price, 24.99);
});

test("isCanonicalPriceValue does not treat a product name as a bundle", () => {
  assert.equal(isCanonicalPriceValue("airpod_case", "Case + Charm"), true);
  assert.equal(
    isCanonicalPriceValue("airpod_case", "Hello Kitty + Charm"),
    false,
  );
});

test("entry price for a custom-only listing trusts the stored snapshot", () => {
  assert.equal(
    listingEntryPrice({
      productType: "airpod_case",
      storedPrice: "34.99",
      currency: "USD",
      customStyles: [{ ...kitty, price: 34.99 }],
    }),
    34.99,
  );
});

test("minOfferedPrice is the cheapest canonical or custom value", () => {
  assert.equal(
    minOfferedPrice({
      productType: "airpod_case",
      currency: "USD",
      canonicalStyles: ["Case Only"],
      customStyles: [kitty],
      basePrice: 24.99,
    }),
    24.99,
  );
  assert.equal(
    minOfferedPrice({
      productType: "airpod_case",
      currency: "USD",
      canonicalStyles: [],
      customStyles: [kitty],
      basePrice: 24.99,
    }),
    34.99,
  );
});

test("suggested price guesses a bundle from the label", () => {
  assert.equal(
    suggestedCustomStylePrice("airpod_case", "USD", "Hello Kitty + Charm"),
    34.99,
  );
  assert.equal(
    suggestedCustomStylePrice("airpod_case", "USD", "Charm only keychain"),
    12.99,
  );
});

test("price presets are this device type's live tiers, unique by amount", () => {
  const airpods = customStylePricePresets("airpod_case", "USD");
  assert.deepEqual(
    airpods.map((p) => [p.label, p.price, p.also]),
    [
      ["Case + Charm", 34.99, []],
      ["Case Only", 24.99, []],
      ["Charm Only", 12.99, []],
    ],
  );
  const iphone = customStylePricePresets("iphone_case", "USD");
  assert.deepEqual(
    iphone.map((p) => [p.label, p.price, p.also]),
    [
      ["Case + Grip + Charm", 39.99, []],
      ["Case + Grip", 34.99, ["Case + Charm"]],
      ["Case Only", 24.99, ["Grip Only"]],
      ["Charm Only", 12.99, []],
    ],
  );
  const watch = customStylePricePresets("watch_band", "USD");
  assert.equal(watch.length, 1);
  assert.equal(watch[0].price, 14.99);
  assert.equal(isDevicePricePreset("airpod_case", "USD", 34.99), true);
  assert.equal(isDevicePricePreset("airpod_case", "USD", 19.99), false);
});

test("linking a photo tags it and clears the previous custom that owned it", () => {
  const result = setImageVariationTag({
    imageId: 2,
    style: "Kuromi + Charm",
    customStyles: [
      { id: "a", label: "Hello Kitty + Charm", price: 34.99, imageId: 2 },
      { id: "b", label: "Kuromi + Charm", price: 34.99, imageId: null },
    ],
    imageIds: [1, 2, 3],
    tagsByImageId: { 2: ["Hello Kitty + Charm"] },
    offered: ["Hello Kitty + Charm", "Kuromi + Charm"],
  });
  assert.equal(result.customStyles[0].imageId, null);
  assert.equal(result.customStyles[1].imageId, 2);
  assert.deepEqual(result.tagsByImageId[2], ["Kuromi + Charm"]);
});

test("applyCustomImageTags makes the picker the source of truth on write", () => {
  const tags = applyCustomImageTags(
    { 1: ["Hello Kitty + Charm"], 2: ["Case Only"] },
    [{ id: "a", label: "Hello Kitty + Charm", price: 34.99, imageId: 3 }],
    ["Case Only", "Hello Kitty + Charm"],
    [1, 2, 3],
  );
  assert.deepEqual(tags[1], []);
  assert.deepEqual(tags[2], ["Case Only"]);
  assert.deepEqual(tags[3], ["Hello Kitty + Charm"]);
});

test("recoverCustomImageLinks fills a missing imageId from tags", () => {
  const recovered = recoverCustomImageLinks(
    [{ id: "a", label: "Hello Kitty + Charm", price: 34.99, imageId: null }],
    { 11: ["Hello Kitty + Charm"] },
  );
  assert.equal(recovered[0].imageId, 11);
});

test("variationImage prefers the linked photo, then a tagged photo", () => {
  const images = [
    { id: 1, url: "/a", styleTags: [] as string[] },
    { id: 11, url: "/kitty", styleTags: ["Hello Kitty + Charm"] },
  ];
  assert.equal(
    variationImage(images, "Hello Kitty + Charm", [kitty])?.url,
    "/kitty",
  );
  assert.equal(customStyleByLabel([kitty], "Hello Kitty + Charm")?.id, "cs_kitty");
});

test("imageForStyleSelection does not fall back to the hero photo", () => {
  const images = [
    { id: 1, url: "/hero", styleTags: [] as string[] },
    { id: 2, url: "/other", styleTags: ["Case Only"] },
  ];
  assert.equal(
    imageForStyleSelection(images, "Hello Kitty + Charm", [
      { ...kitty, imageId: null },
    ]),
    undefined,
  );
  assert.equal(variationImage(images, "Hello Kitty + Charm", [])?.url, "/hero");
});

test("renaming a custom row rewrites the photo tag so it is not stripped", () => {
  const rewritten = rewriteTagsAfterCustomEdit(
    { 11: ["Hello Kitty + Charm"], 2: ["Case Only"] },
    [kitty],
    [{ ...kitty, label: "Kitty Charm Set" }],
  );
  assert.deepEqual(rewritten[11], ["Kitty Charm Set"]);
  assert.deepEqual(rewritten[2], ["Case Only"]);
  const tags = syncCustomDraftMedia({
    imageIds: [2, 11],
    tagsByImageId: { 11: ["Hello Kitty + Charm"], 2: ["Case Only"] },
    previous: [kitty],
    next: [{ ...kitty, label: "Kitty Charm Set" }],
    canonical: ["Case Only"],
  });
  assert.deepEqual(tags[11], ["Kitty Charm Set"]);
  assert.deepEqual(tags[2], ["Case Only"]);
});

test("hydrateCustomStyles fills imageId from an already-tagged photo", () => {
  const rows = hydrateCustomStyles(
    [{ id: "a", label: "Hello Kitty + Charm", price: 34.99, imageId: null }],
    [{ id: 11, styleTags: ["Hello Kitty + Charm"] }],
    "airpod_case",
  );
  assert.equal(rows[0].imageId, 11);
});

const failedOut = failed;
const passedOut = passed;
if (failedOut > 0) {
  console.error(`\n${failedOut} failed, ${passedOut} passed`);
  process.exit(1);
}
console.log(`check-custom-styles: ${passedOut} passed`);

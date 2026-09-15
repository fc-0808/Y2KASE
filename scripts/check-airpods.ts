/**
 * AirPods fit invariants — shared moulds, aliases, product-type wiring.
 *
 *   tsx scripts/check-airpods.ts
 *
 * The failure mode this guards: treating AirPods 5 as a second SKU when it
 * shares a shell with AirPods 4, or leaving ingest on the old `"AirPods 4"`
 * chip so new listings never offer 5.
 */
import assert from "node:assert/strict";

import {
  AIRPODS_4_5,
  AIRPODS_MODEL_OPTION_NAME,
  AIRPODS_MODELS,
  AIRPODS_SHARED_FIT_NOTE,
  airpodsChipLabel,
  canonicalizeAirpodsModel,
  defaultAirpodsModelFor,
  defaultAirpodsModels,
  extendAirpodsSharedFits,
  offersAirpods45,
  orderAirpodsModels,
} from "../src/lib/catalog/airpods";
import { getProductType } from "../src/lib/catalog/product-types";
import {
  compatibilityChipLabel,
  hasCompatibilityAxis,
  hasPriceAxis,
  normalizeOfferedCompatibility,
  normalizeOfferedPriceValues,
  offeredCompatibilityValues,
  offeredPriceValues,
  priceForOfferedStyle,
  summarizeCompatibility,
} from "../src/lib/catalog/offered-options";
import {
  AIRPODS_STYLES,
  PRICE_TABLE,
  STYLE_OPTION_NAME,
  getAirpodsBasePrice,
  getAirpodsStylePrice,
  getBasePrice,
  getStylePrice,
} from "../src/lib/pricing";

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

test("the AirPods case type is wired to the shared-mould registry", () => {
  const type = getProductType("airpod_case");
  assert.equal(type.id, "airpod_case");
  assert.equal(type.options[0]?.name, AIRPODS_MODEL_OPTION_NAME);
  assert.deepEqual(type.options[0]?.values, [...AIRPODS_MODELS]);
  assert.equal(type.options[0]?.role, "compatibility");
});

test("AirPods cases offer Case + Charm, Case Only and Charm Only — never grip", () => {
  const type = getProductType("airpod_case");
  assert.equal(hasPriceAxis("airpod_case"), true);
  assert.equal(type.options[1]?.name, STYLE_OPTION_NAME);
  assert.equal(type.options[1]?.role, "price");
  assert.deepEqual(type.options[1]?.values, [...AIRPODS_STYLES]);
  assert.equal(
    (AIRPODS_STYLES as readonly string[]).includes("Grip Only"),
    false,
  );
  assert.equal(
    (AIRPODS_STYLES as readonly string[]).includes("Case + Grip"),
    false,
  );
});

test("AirPods style prices are the phone-case prices for the same styles", () => {
  const type = getProductType("airpod_case");
  const currencies = Object.keys(PRICE_TABLE);
  for (const currency of currencies) {
    for (const style of AIRPODS_STYLES) {
      assert.equal(
        getAirpodsStylePrice(style, currency),
        getStylePrice(style, currency),
        `${style} ${currency}`,
      );
    }
    assert.equal(getAirpodsBasePrice(currency), getBasePrice(currency));
  }
  // The amounts the PDP quotes against Case Only (USD), matching the iPhone picker.
  assert.equal(getAirpodsStylePrice("Case Only", "USD"), 24.99);
  assert.equal(getAirpodsStylePrice("Case + Charm", "USD"), 34.99);
  assert.equal(getAirpodsStylePrice("Charm Only", "USD"), 12.99);
  assert.equal(
    type.getPriceFromOptions({ [STYLE_OPTION_NAME]: "Case + Charm" }, "USD"),
    34.99,
  );
  assert.equal(priceForOfferedStyle("airpod_case", "Case Only", "USD"), 24.99);
});

test("a grip style is not an AirPods SKU and prices as Case Only", () => {
  assert.equal(getAirpodsStylePrice("Case + Grip", "USD"), 24.99);
  assert.equal(getAirpodsStylePrice("Grip Only", "USD"), 24.99);
  assert.equal(getAirpodsStylePrice("Case + Grip + Charm", "USD"), 24.99);
});

test("a missing Style option falls back to the three AirPods styles", () => {
  assert.deepEqual(
    offeredPriceValues("airpod_case", [
      { name: AIRPODS_MODEL_OPTION_NAME, values: [...AIRPODS_MODELS] },
    ]),
    [...AIRPODS_STYLES],
  );
});

test("grip styles cannot hitch onto an AirPods listing", () => {
  assert.deepEqual(
    normalizeOfferedPriceValues("airpod_case", [
      "Case Only",
      "Case + Grip",
      "Charm Only",
      "Case + Charm",
    ]),
    ["Case + Charm", "Case Only", "Charm Only"],
  );
});

test("AirPods 4 and 5 are one chip, not two SKUs", () => {
  assert.ok(AIRPODS_MODELS.includes(AIRPODS_4_5));
  assert.equal(
    (AIRPODS_MODELS as readonly string[]).includes("AirPods 4"),
    false,
  );
  assert.equal(
    (AIRPODS_MODELS as readonly string[]).includes("AirPods 5"),
    false,
  );
  assert.ok(AIRPODS_MODELS.includes("AirPods 1 / 2"));
  assert.match(AIRPODS_SHARED_FIT_NOTE, /AirPods 4/);
  assert.match(AIRPODS_SHARED_FIT_NOTE, /AirPods 5/);
});

test("aliases of the 4/5 mould canonicalize to the shared chip", () => {
  assert.equal(canonicalizeAirpodsModel("AirPods 4"), AIRPODS_4_5);
  assert.equal(canonicalizeAirpodsModel("AirPods 5"), AIRPODS_4_5);
  assert.equal(canonicalizeAirpodsModel("AirPods 4 / 5"), AIRPODS_4_5);
  assert.equal(canonicalizeAirpodsModel("AirPods 4/5"), AIRPODS_4_5);
  assert.equal(canonicalizeAirpodsModel("AirPods 5 / 4"), AIRPODS_4_5);
  assert.equal(canonicalizeAirpodsModel("airpods 4 and 5"), AIRPODS_4_5);
  assert.equal(canonicalizeAirpodsModel("  AirPods  4  "), AIRPODS_4_5);
});

test("other AirPods shells are left alone", () => {
  assert.equal(canonicalizeAirpodsModel("AirPods Pro 3"), "AirPods Pro 3");
  assert.equal(canonicalizeAirpodsModel("AirPods Pro 2"), "AirPods Pro 2");
  assert.equal(canonicalizeAirpodsModel("AirPods 3"), "AirPods 3");
  assert.equal(canonicalizeAirpodsModel("AirPods 1 / 2"), "AirPods 1 / 2");
});

test("AirPods Max is not a sellable fit and is dropped on normalize", () => {
  assert.equal(canonicalizeAirpodsModel("AirPods Max"), "");
  assert.equal(
    (AIRPODS_MODELS as readonly string[]).includes("AirPods Max"),
    false,
  );
  assert.deepEqual(extendAirpodsSharedFits(["AirPods Max"]), []);
  assert.deepEqual(
    extendAirpodsSharedFits(["AirPods Pro 3", "AirPods Max", "AirPods 3"]),
    ["AirPods Pro 3", "AirPods 3"],
  );
  assert.deepEqual(
    orderAirpodsModels(["AirPods Max", "AirPods 3", AIRPODS_4_5]),
    [AIRPODS_4_5, "AirPods 3"],
  );
  assert.equal(defaultAirpodsModelFor(["AirPods Max"]), "AirPods Pro 3");
});

test("extending a 4-only listing gains 5 without unlocking other shells", () => {
  assert.deepEqual(extendAirpodsSharedFits(["AirPods 4"]), [AIRPODS_4_5]);
  assert.deepEqual(
    extendAirpodsSharedFits(["AirPods Pro 3", "AirPods 4", "AirPods 3"]),
    ["AirPods Pro 3", AIRPODS_4_5, "AirPods 3"],
  );
});

test("a Pro-only listing does not grow a 4/5 chip", () => {
  assert.deepEqual(extendAirpodsSharedFits(["AirPods Pro 3"]), [
    "AirPods Pro 3",
  ]);
  assert.equal(offersAirpods45(["AirPods Pro 3", "AirPods Pro 2"]), false);
});

test("duplicate 4 and 5 chips collapse to one value", () => {
  assert.deepEqual(
    extendAirpodsSharedFits(["AirPods 5", "AirPods 4", AIRPODS_4_5]),
    [AIRPODS_4_5],
  );
});

test("the rewrite is idempotent", () => {
  const once = extendAirpodsSharedFits(["AirPods Pro 2", "AirPods 4"]);
  assert.deepEqual(extendAirpodsSharedFits(once), once);
  assert.deepEqual(extendAirpodsSharedFits(defaultAirpodsModels()), [
    ...AIRPODS_MODELS,
  ]);
});

test("empty lists stay empty; callers opt into the full default", () => {
  assert.deepEqual(extendAirpodsSharedFits([]), []);
  assert.deepEqual(defaultAirpodsModels(), [...AIRPODS_MODELS]);
});

test("master order is newest / highest-intent first, unknowns trail", () => {
  assert.deepEqual(
    orderAirpodsModels(["AirPods 3", AIRPODS_4_5, "AirPods Pro 2"]),
    ["AirPods Pro 2", AIRPODS_4_5, "AirPods 3"],
  );
  assert.deepEqual(
    orderAirpodsModels([AIRPODS_4_5, "AirPods Studio"]),
    [AIRPODS_4_5, "AirPods Studio"],
  );
});

test("the PDP default is the first offered chip in master order", () => {
  assert.equal(defaultAirpodsModelFor([...AIRPODS_MODELS]), "AirPods Pro 3");
  assert.equal(defaultAirpodsModelFor(["AirPods 4", "AirPods 3"]), AIRPODS_4_5);
  assert.equal(defaultAirpodsModelFor(["AirPods 3"]), "AirPods 3");
});

test("chip labels drop the repeated AirPods prefix", () => {
  assert.equal(airpodsChipLabel(AIRPODS_4_5), "4 / 5");
  assert.equal(airpodsChipLabel("AirPods Pro 3"), "Pro 3");
});

test("admin overview reads AirPods fit from the AirPods axis, not iPhone Model", () => {
  const options = [
    { name: AIRPODS_MODEL_OPTION_NAME, values: [...AIRPODS_MODELS] },
    { name: "iPhone Model", values: ["iPhone 17 Pro"] },
  ];
  assert.equal(hasPriceAxis("airpod_case"), true);
  assert.equal(hasCompatibilityAxis("airpod_case"), true);
  assert.deepEqual(offeredPriceValues("airpod_case", options), [
    ...AIRPODS_STYLES,
  ]);
  assert.deepEqual(offeredCompatibilityValues("airpod_case", options), [
    ...AIRPODS_MODELS,
  ]);
  assert.equal(
    summarizeCompatibility("airpod_case", AIRPODS_MODELS),
    "All fits",
  );
  assert.equal(compatibilityChipLabel("airpod_case", AIRPODS_4_5), "4 / 5");
});

test("a missing AirPods axis reads as empty, not as the iPhone leftover", () => {
  const options = [{ name: "iPhone Model", values: ["iPhone 17 Pro"] }];
  assert.deepEqual(offeredCompatibilityValues("airpod_case", options), []);
  assert.equal(summarizeCompatibility("airpod_case", []), "Not set");
});

test("AirPods 4 stored on the axis canonicalizes to the shared 4/5 mould", () => {
  assert.deepEqual(
    offeredCompatibilityValues("airpod_case", [
      { name: AIRPODS_MODEL_OPTION_NAME, values: ["AirPods Pro 3", "AirPods 4"] },
    ]),
    ["AirPods Pro 3", AIRPODS_4_5],
  );
  assert.deepEqual(normalizeOfferedCompatibility("airpod_case", ["AirPods 5"]), [
    AIRPODS_4_5,
  ]);
});

test("iPhone cases still read Style + iPhone Model", () => {
  const options = [
    { name: "Style", values: ["Case Only", "Case + Charm"] },
    { name: "iPhone Model", values: ["iPhone 17 Pro", "iPhone 16"] },
  ];
  assert.equal(hasPriceAxis("iphone_case"), true);
  assert.deepEqual(offeredPriceValues("iphone_case", options), [
    "Case + Charm",
    "Case Only",
  ]);
  assert.deepEqual(offeredCompatibilityValues("iphone_case", options), [
    "iPhone 16",
    "iPhone 17 Pro",
  ]);
  assert.equal(
    summarizeCompatibility("iphone_case", [
      "iPhone 16",
      "iPhone 16 Pro",
      "iPhone 16 Pro Max",
    ]),
    "iPhone 16",
  );
});

test("a universal accessory has neither axis", () => {
  assert.equal(hasPriceAxis("apple_accessory"), false);
  assert.equal(hasCompatibilityAxis("apple_accessory"), false);
  assert.deepEqual(offeredCompatibilityValues("apple_accessory", []), []);
});

if (failed > 0) {
  console.error(`\n${failed} AirPods check(s) failed, ${passed} passed.`);
  process.exit(1);
}
console.log(`AirPods fit invariants passed (${passed}).`);

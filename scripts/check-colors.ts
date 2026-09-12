/**
 * Color facet invariants — taxonomy, classification, URL state.
 *
 *   tsx scripts/check-colors.ts
 *
 * These are the failure modes that silently wreck a color filter: alias
 * fragmentation ("navy" vs "blue"), false positives ("red" inside "hundred"),
 * character-as-color guesses, and query params that aren't in the vocabulary.
 */
import assert from "node:assert/strict";

import {
  COLOR_FAMILIES,
  COLOR_FAMILY_SLUGS,
  classifyColorsFromPixels,
  classifyColorsFromText,
  classifyProductColors,
  colorFamilyFromRgb,
  merchantColorValue,
  mergeColorClassifications,
  parseColorFamilies,
  parseColorFamily,
} from "../src/lib/catalog/colors";
import {
  buildCatalogHref,
  hasActiveFilters,
  parseCatalogParams,
} from "../src/lib/catalog/params";

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

test("every family has a unique slug and at least one alias", () => {
  assert.equal(COLOR_FAMILIES.length, COLOR_FAMILY_SLUGS.length);
  const slugs = new Set(COLOR_FAMILIES.map((f) => f.slug));
  assert.equal(slugs.size, COLOR_FAMILIES.length);
  for (const family of COLOR_FAMILIES) {
    assert.ok(family.aliases.length > 0, family.slug);
    assert.ok(family.label.length > 0, family.slug);
  }
});

test("navy, sky and cobalt all collapse to blue", () => {
  assert.deepEqual(classifyColorsFromText("navy blue case"), ["blue"]);
  assert.deepEqual(classifyColorsFromText("sky blue glitter"), ["blue"]);
  assert.deepEqual(classifyColorsFromText("cobalt frame"), ["blue"]);
});

test("mint green and 薄荷绿 land in green", () => {
  assert.deepEqual(classifyColorsFromText("Rilakkuma Mint Green Matte"), [
    "green",
  ]);
  assert.deepEqual(classifyColorsFromText("磨砂蜜瓜薄荷绿轻松熊"), ["green"]);
});

test("rose gold is gold, not pink", () => {
  assert.deepEqual(classifyColorsFromText("rose gold foil charm"), ["gold"]);
});

test("clear + a hue both survive", () => {
  assert.deepEqual(
    classifyColorsFromText("Clear Glitter Fill Purple Frame Charm"),
    ["purple", "clear"],
  );
});

test("粉红色 is pink, not also red", () => {
  assert.deepEqual(classifyColorsFromText("粉红色手机壳"), ["pink"]);
});

test("transparent / 透明 map to clear", () => {
  assert.deepEqual(classifyColorsFromText("transparent TPU"), ["clear"]);
  assert.deepEqual(classifyColorsFromText("透明手机壳"), ["clear"]);
});

test("word boundaries stop false positives", () => {
  assert.deepEqual(classifyColorsFromText("a hundred featured stands"), []);
  assert.deepEqual(classifyColorsFromText("Hello Kitty bow case"), []);
  assert.deepEqual(classifyColorsFromText("Kuromi"), []);
});

test("character names are never a color signal", () => {
  assert.deepEqual(
    classifyProductColors({
      title: "Sanrio Hello Kitty Kawaii Case with Charm",
      tags: ["hello_kitty", "sanrio"],
      sourceFolder: "Sanrio/凯蒂猫001",
    }),
    [],
  );
});

test("folder + title together still classify", () => {
  assert.deepEqual(
    classifyProductColors({
      title: "Sanrio Kuromi Case",
      sourceFolder: "Sanrio/黑色库洛米",
    }),
    ["black"],
  );
});

test("parseColorFamily accepts slugs and aliases", () => {
  assert.equal(parseColorFamily("Pink"), "pink");
  assert.equal(parseColorFamily("navy"), "blue");
  assert.equal(parseColorFamily("chartreuse"), null);
  assert.deepEqual(parseColorFamilies(["navy", "pink", "pink", "nope"]), [
    "pink",
    "blue",
  ]);
});

test("pixel buckets agree with the text families", () => {
  assert.equal(colorFamilyFromRgb(255, 255, 255), null); // canvas
  assert.equal(colorFamilyFromRgb(20, 20, 20), "black");
  assert.equal(colorFamilyFromRgb(255, 90, 160), "pink");
  assert.equal(colorFamilyFromRgb(40, 90, 220), "blue");
});

test("trace pixels do not invent a family", () => {
  const pink = { r: 255, g: 90, b: 160 };
  const black = { r: 20, g: 20, b: 20 };
  const pixels = [...Array.from({ length: 200 }, () => black), pink, pink];
  assert.deepEqual(classifyColorsFromPixels(pixels), ["black"]);
});

test("merge keeps taxonomy order and the per-product cap", () => {
  assert.deepEqual(
    mergeColorClassifications(["blue"], ["pink", "clear"], ["blue"]),
    ["pink", "blue", "clear"],
  );
});

test("merchant color joins with a slash", () => {
  assert.equal(merchantColorValue(["pink", "clear"]), "Pink/Clear");
  assert.equal(merchantColorValue([]), null);
  assert.equal(merchantColorValue(["nope"]), null);
});

test("URL state round-trips and drops unknown colors", () => {
  const parsed = parseCatalogParams(
    { color: ["pink", "navy", "chartreuse"], brand: "sanrio" },
    "/products",
  );
  assert.deepEqual(parsed.colors, ["pink"]);
  assert.equal(
    buildCatalogHref(parsed),
    "/products?brand=sanrio&color=pink",
  );
  assert.equal(hasActiveFilters(parsed), true);
});

test("comma-separated color params are accepted", () => {
  const parsed = parseCatalogParams(
    { color: "blue,pink,blue" },
    "/collections/sanrio",
  );
  assert.deepEqual(parsed.colors, ["pink", "blue"]);
  assert.equal(
    buildCatalogHref(parsed),
    "/collections/sanrio?color=pink&color=blue",
  );
});

test("changing color resets pagination", () => {
  const params = parseCatalogParams(
    { color: "pink", page: "4" },
    "/products",
  );
  assert.equal(params.page, 4);
  assert.equal(
    buildCatalogHref(params, { colors: ["blue"] }),
    "/products?color=blue",
  );
});

if (failed > 0) {
  console.error(`\n${failed} color check(s) failed, ${passed} passed.`);
  process.exit(1);
}
console.log(`Color facet invariants passed (${passed}).`);

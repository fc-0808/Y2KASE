/**
 * Motif facet invariants — taxonomy, classification, URL state, Originals.
 *
 *   tsx scripts/check-motifs.ts
 *
 * Failure modes that silently wreck a theme filter: character-as-motif
 * guesses (Hello Kitty → cat), CJK substring traps (凯蒂猫 → 猫), alias
 * fragmentation, and query params that aren't in the vocabulary.
 */
import assert from "node:assert/strict";

import {
  isUnlicensedProduct,
  ipRecognitionPhrases,
} from "../src/lib/catalog/brands";
import { ORIGINALS_SLUG } from "../src/lib/catalog/collections-config";
import {
  MOTIF_FAMILIES,
  MOTIF_FAMILY_SLUGS,
  classifyMotifsFromText,
  classifyProductMotifs,
  mergeMotifClassifications,
  parseMotifFamilies,
  parseMotifFamily,
} from "../src/lib/catalog/motifs";
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
  assert.equal(MOTIF_FAMILIES.length, MOTIF_FAMILY_SLUGS.length);
  const slugs = new Set(MOTIF_FAMILIES.map((f) => f.slug));
  assert.equal(slugs.size, MOTIF_FAMILIES.length);
  for (const family of MOTIF_FAMILIES) {
    assert.ok(family.aliases.length > 0, family.slug);
    assert.ok(family.label.length > 0, family.slug);
  }
});

test("rainy cloud classifies as clouds, not a brand", () => {
  assert.deepEqual(
    classifyMotifsFromText(
      "Rainy Cloud Cute Clear Phone Case with 3D Cloud Grip",
    ),
    ["clouds"],
  );
});

test("puppy + whale lands puppy and animals", () => {
  assert.deepEqual(
    classifyMotifsFromText("Cute Kawaii Puppy & Whale Glitter Phone Case"),
    ["puppy", "animals"],
  );
});

test("polka dot pig is patterns + animals, not a character", () => {
  assert.deepEqual(
    classifyMotifsFromText("Yellow Polka Dot Pig Face Phone Case"),
    ["animals", "patterns"],
  );
});

test("butterfly is animals; a 蝴蝶结 bow is not a butterfly", () => {
  assert.deepEqual(
    classifyMotifsFromText("Sparkling Red Butterfly Phone Case"),
    ["animals"],
  );
  assert.deepEqual(classifyMotifsFromText("粉色蝴蝶结手机壳"), ["bows"]);
});

test("anime/cartoon character copy is dolls, generic character grip is not", () => {
  assert.deepEqual(
    classifyProductMotifs({
      title: "Cute green anime character phone case with ring stand",
    }),
    ["dolls"],
  );
  assert.deepEqual(
    classifyProductMotifs({
      title: "Cute cartoon character phone case with beaded charm",
    }),
    ["dolls"],
  );
  assert.deepEqual(
    classifyProductMotifs({
      title: "Pastel phone case with 3D character grip and charm strap",
    }),
    [],
  );
});

test("Hello Kitty is not Cat, even with a bow", () => {
  assert.deepEqual(
    classifyProductMotifs({
      title: "Hello Kitty Pink Bow Phone Case with Beaded Strap",
      tags: ["hello_kitty", "sanrio"],
    }),
    ["bows"],
  );
});

test("character names alone never invent a motif", () => {
  assert.deepEqual(
    classifyProductMotifs({
      title: "Sanrio Hello Kitty Kawaii Case with Charm",
      tags: ["hello_kitty", "sanrio"],
      sourceFolder: "Sanrio/凯蒂猫001",
    }),
    [],
  );
});

test("凯蒂猫 does not fire 猫", () => {
  assert.deepEqual(classifyMotifsFromText("凯蒂猫手机壳"), []);
});

test("Minnie Mouse does not fire animals via mouse", () => {
  assert.deepEqual(
    classifyMotifsFromText("Minnie Mouse Pop-Up Stand Phone Case"),
    [],
  );
});

test("Cinnamoroll is not clouds", () => {
  assert.deepEqual(
    classifyProductMotifs({
      title: "Cinnamoroll Kawaii Sticker Case",
      tags: ["cinnamoroll"],
    }),
    [],
  );
});

test("Miffy is not bunny unless the title says bunny", () => {
  assert.deepEqual(
    classifyProductMotifs({
      title: "Miffy Pink Clear Phone Case with Beaded Charm",
    }),
    [],
  );
  assert.deepEqual(
    classifyProductMotifs({
      title: "Miffy-Inspired Polka Dot MagSafe Phone Case",
      description: "A sweet little bunny on a dotted shell.",
    }),
    ["patterns"],
  );
  assert.deepEqual(
    classifyMotifsFromText("Cute bunny floral phone case"),
    ["bunny", "florals"],
  );
});

test("word boundaries stop false positives", () => {
  assert.deepEqual(classifyMotifsFromText("rainbow featured stands"), []);
  assert.deepEqual(classifyMotifsFromText("a hundred girly cases"), []);
});

test("soft girl in copy is not Dolls; pixel girl is", () => {
  assert.deepEqual(
    classifyMotifsFromText("Pastel case in a soft girl aesthetic"),
    [],
  );
  assert.deepEqual(
    classifyMotifsFromText("Cute pixel girl clear phone case"),
    ["dolls"],
  );
});

test("a star charm strap is not the Stars facet", () => {
  assert.deepEqual(
    classifyMotifsFromText(
      "Tamagotchi Kawaii Phone Case with Glitter & Star Charm Strap",
    ),
    [],
  );
  assert.deepEqual(
    classifyMotifsFromText("Pastel Star Clear Phone Case with Ring Stand"),
    ["stars"],
  );
});

test("parseMotifFamily accepts slugs and aliases", () => {
  assert.equal(parseMotifFamily("Puppy"), "puppy");
  assert.equal(parseMotifFamily("rainy cloud"), "clouds");
  assert.equal(parseMotifFamily("chartreuse"), null);
  assert.deepEqual(parseMotifFamilies(["Puppy", "clouds", "clouds", "nope"]), [
    "puppy",
    "clouds",
  ]);
});

test("merge keeps taxonomy order and the per-product cap", () => {
  assert.deepEqual(
    mergeMotifClassifications(["bows"], ["puppy", "clouds"], ["bows"]),
    ["puppy", "clouds", "bows"],
  );
});

test("URL state round-trips and drops unknown motifs", () => {
  const parsed = parseCatalogParams(
    { motif: ["clouds", "chartreuse"], brand: "sanrio" },
    "/products",
  );
  assert.deepEqual(parsed.motifs, ["clouds"]);
  assert.equal(
    buildCatalogHref(parsed),
    "/products?brand=sanrio&motif=clouds",
  );
  assert.equal(hasActiveFilters(parsed), true);
});

test("comma-separated motif params are accepted", () => {
  const parsed = parseCatalogParams(
    { motif: "puppy,clouds,puppy" },
    "/collections/originals",
  );
  assert.deepEqual(parsed.motifs, ["puppy", "clouds"]);
  assert.equal(
    buildCatalogHref(parsed),
    "/collections/originals?motif=puppy&motif=clouds",
  );
});

test("changing motif resets pagination", () => {
  const params = parseCatalogParams(
    { motif: "clouds", page: "4" },
    "/products",
  );
  assert.equal(params.page, 4);
  assert.equal(
    buildCatalogHref(params, { motifs: ["puppy"] }),
    "/products?motif=puppy",
  );
});

test("descriptions do not vote — marketing fluff is not the print", () => {
  assert.deepEqual(
    classifyProductMotifs({
      title: "Rainy Cloud Cute Clear Phone Case with 3D Cloud Grip",
      description: "Tiny star accent, strawberry bow, bunny charm.",
      tags: ["bunny", "star", "girl"],
    }),
    ["clouds"],
  );
});

test("Originals is a genre node, not a brand", () => {
  assert.equal(ORIGINALS_SLUG, "originals");
});

test("unlicensed products are Originals candidates; unknown IP is not", () => {
  assert.equal(isUnlicensedProduct(null, null), true);
  assert.equal(isUnlicensedProduct("", ""), true);
  assert.equal(isUnlicensedProduct("Y2KASE", null), true);
  assert.equal(isUnlicensedProduct("Sanrio", "Hello Kitty"), false);
  assert.equal(isUnlicensedProduct("Labubu", null), false);
});

test("IP strip list is long-enough phrases, not single letters", () => {
  assert.ok(ipRecognitionPhrases().every((phrase) => phrase.length >= 3));
  assert.ok(ipRecognitionPhrases().includes("Hello Kitty"));
});

if (failed > 0) {
  console.error(`\n${failed} motif check(s) failed, ${passed} passed.`);
  process.exit(1);
}
console.log(`Motif facet invariants passed (${passed}).`);

/**
 * Look-rail decisions: one tap is one design, the character strip matches the
 * homepage lead order, and a shared URL stays recoverable.
 */
import assert from "node:assert/strict";
import {
  characterLandingClearPath,
  characterLandingRail,
  lookCharacters,
  type CharacterLandingNode,
} from "../src/lib/catalog/look-characters";
import {
  activeLookSegment,
  isSoloDesignView,
  lookSegments,
  nextLookSelection,
  orderByLabel,
  railScrollLeft,
  stockedFamilies,
} from "../src/lib/catalog/look-rail";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

const brands = [
  {
    slug: "sanrio",
    name: "Sanrio",
    icon: null,
    accentColor: "#ff8ad4",
    children: [
      { slug: "hello-kitty", name: "Hello Kitty", icon: null, accentColor: null },
      { slug: "kuromi", name: "Kuromi", icon: null, accentColor: null },
    ],
  },
  { slug: "miffy", name: "Miffy", icon: "🐰", accentColor: null },
  {
    slug: "peanuts",
    name: "Peanuts",
    icon: null,
    accentColor: null,
    children: [{ slug: "snoopy", name: "Snoopy", icon: null, accentColor: null }],
  },
  { slug: "anime", name: "Anime", icon: null, accentColor: null },
  { slug: "rilakkuma", name: "Rilakkuma", icon: null, accentColor: null },
];

const counts: Record<string, number> = {
  sanrio: 100,
  "hello-kitty": 40,
  kuromi: 20,
  miffy: 30,
  peanuts: 10,
  snoopy: 10,
  anime: 50,
  rilakkuma: 5,
};

test("a second tap on the only selected look clears it", () => {
  assert.deepEqual(nextLookSelection(["kuromi"], "kuromi"), []);
});

test("a tap replaces whatever else is selected in that facet", () => {
  assert.deepEqual(nextLookSelection(["kuromi", "hello-kitty"], "miffy"), [
    "miffy",
  ]);
  assert.deepEqual(nextLookSelection([], "pink"), ["pink"]);
});

test("Sanrio's crew leads, and a small Kuromi count does not bury it", () => {
  const tiles = lookCharacters(brands, counts, [], 14);
  assert.deepEqual(
    tiles.map((tile) => tile.slug),
    ["sanrio", "hello-kitty", "kuromi", "miffy", "peanuts", "rilakkuma"],
  );
});

test("Originals closes the row even when it has the most products", () => {
  const tiles = lookCharacters(
    brands,
    { ...counts, originals: 500 },
    [],
    4,
  );
  assert.equal(tiles.at(-1)?.slug, "originals");
  assert.equal(tiles[2]?.slug, "kuromi");
});

test("a character who is the whole parent shop is not a second tile", () => {
  const tiles = lookCharacters(brands, counts, [], 14);
  assert.equal(
    tiles.some((tile) => tile.slug === "snoopy"),
    false,
  );
});

test("a hidden genre stays off the strip unless that exact filter is on", () => {
  assert.equal(
    lookCharacters(brands, counts, [], 14).some((tile) => tile.slug === "anime"),
    false,
  );
  const selected = lookCharacters(brands, counts, ["anime"], 14);
  assert.equal(
    selected.some((tile) => tile.slug === "anime"),
    true,
  );
});

test("a selected look past the cap is still on the strip", () => {
  const tiles = lookCharacters(brands, counts, ["rilakkuma"], 4);
  assert.equal(tiles[0]?.slug, "rilakkuma");
  assert.equal(tiles.length, 5);
});

test("a selected same-shop character stays so the filter can be cleared", () => {
  const tiles = lookCharacters(brands, counts, ["snoopy"], 14);
  assert.equal(
    tiles.some((tile) => tile.slug === "snoopy"),
    true,
  );
});

test("empty families drop out and the rest keep their order", () => {
  const families = [
    { slug: "puppy" },
    { slug: "clouds" },
    { slug: "fruit" },
  ];
  assert.deepEqual(
    stockedFamilies(families, { puppy: 2, clouds: 0, fruit: 4 }, []).map(
      (family) => family.slug,
    ),
    ["puppy", "fruit"],
  );
  assert.deepEqual(
    stockedFamilies(families, { puppy: 2, clouds: 0, fruit: 0 }, ["clouds"]).map(
      (family) => family.slug,
    ),
    ["puppy", "clouds"],
  );
});

test("the open segment follows an explicit pick, then the active facet", () => {
  const segments = lookSegments({ characters: 3, themes: 2, colors: 1 });
  assert.equal(
    activeLookSegment(segments, "colors", { brands: 1, motifs: 0, colors: 0 }),
    "colors",
  );
  assert.equal(
    activeLookSegment(segments, null, { brands: 0, motifs: 1, colors: 0 }),
    "themes",
  );
  assert.equal(
    activeLookSegment(segments, "characters", { brands: 0, motifs: 0, colors: 0 }),
    "characters",
  );
  assert.equal(
    activeLookSegment(["themes"], "characters", { brands: 1, motifs: 0, colors: 0 }),
    "themes",
  );
});

test("a heading shows only when one design facet is the entire view", () => {
  assert.equal(
    isSoloDesignView({ brands: ["kuromi"], colors: [], motifs: [] }),
    true,
  );
  assert.equal(
    isSoloDesignView({
      brands: ["kuromi"],
      colors: ["pink"],
      motifs: [],
    }),
    false,
  );
  assert.equal(
    isSoloDesignView({
      brands: ["kuromi"],
      colors: [],
      motifs: [],
      device: "iphone",
    }),
    false,
  );
  assert.equal(
    isSoloDesignView({ brands: [], colors: [], motifs: [] }),
    false,
  );
});

test("shop order leaves the merchandised row untouched", () => {
  const row = [{ name: "Kuromi" }, { name: "Hello Kitty" }, { name: "Sanrio" }];
  assert.equal(orderByLabel(row, (item) => item.name, false), row);
});

test("A–Z sorts characters, themes and colors by the visible label", () => {
  const names = orderByLabel(
    [{ name: "Sanrio" }, { name: "Kuromi" }, { name: "Hello Kitty" }, { name: "Originals" }],
    (item) => item.name,
    true,
  ).map((item) => item.name);
  assert.deepEqual(names, ["Hello Kitty", "Kuromi", "Originals", "Sanrio"]);

  const themes = orderByLabel(
    [{ label: "Stars" }, { label: "Bows" }, { label: "Animals" }],
    (item) => item.label,
    true,
  ).map((item) => item.label);
  assert.deepEqual(themes, ["Animals", "Bows", "Stars"]);
});

function shop(
  slug: string,
  kind: string,
  totalCount: number,
  children: CharacterLandingNode[] = [],
): CharacterLandingNode {
  return {
    slug,
    name: slug,
    kind,
    icon: null,
    accentColor: null,
    totalCount,
    children,
  };
}

const landingTree: CharacterLandingNode[] = [
  shop("sanrio", "brand", 80, [
    shop("hello-kitty", "character", 40),
    shop("kuromi", "character", 20),
  ]),
  shop("miffy", "brand", 30),
  shop("tamagotchi", "brand", 12),
  shop("kawaii", "genre", 90),
  shop("rilakkuma", "brand", 8, [shop("korilakkuma", "character", 3)]),
];

test("a character page presses that character among its siblings", () => {
  const landing = characterLandingRail(landingTree, "kuromi");
  assert.ok(landing);
  assert.deepEqual(
    landing.tiles.map((tile) => tile.slug),
    ["hello-kitty", "kuromi"],
  );
  assert.equal(characterLandingClearPath(landingTree, "kuromi"), "/collections/sanrio");
});

test("a character shop with no children presses itself among the other characters", () => {
  const landing = characterLandingRail(landingTree, "miffy");
  assert.ok(landing);
  assert.deepEqual(landing.tiles.map((tile) => tile.slug), [
    "hello-kitty",
    "kuromi",
    "miffy",
    "tamagotchi",
    "korilakkuma",
  ]);
  assert.equal(landing.counts.miffy, 30);
  assert.equal(characterLandingClearPath(landingTree, "miffy"), "/collections");
  const tiles = lookCharacters(landing.tiles, landing.counts, ["miffy"]);
  assert.equal(tiles.some((tile) => tile.slug === "miffy"), true);
  assert.equal(tiles.some((tile) => tile.slug === "originals"), false);
});

test("a brand page presses that brand, including one that has its own characters", () => {
  const sanrio = characterLandingRail(landingTree, "sanrio");
  assert.ok(sanrio);
  assert.equal(sanrio.tiles.some((tile) => tile.slug === "sanrio"), true);
  assert.equal(sanrio.tiles.some((tile) => tile.slug === "hello-kitty"), true);
  assert.equal(sanrio.tiles.some((tile) => tile.slug === "miffy"), true);
  assert.equal(characterLandingClearPath(landingTree, "sanrio"), "/collections");
  const pressed = lookCharacters(sanrio.tiles, sanrio.counts, ["sanrio"]);
  assert.equal(pressed.some((tile) => tile.slug === "sanrio"), true);

  const rilakkuma = characterLandingRail(landingTree, "rilakkuma");
  assert.ok(rilakkuma);
  assert.equal(rilakkuma.tiles.some((tile) => tile.slug === "rilakkuma"), true);
  assert.equal(rilakkuma.tiles.some((tile) => tile.slug === "korilakkuma"), true);
  assert.equal(characterLandingRail(landingTree, "kawaii"), null);
});

test("every brand and character sub-route can mark itself chosen", () => {
  const slugs = ["sanrio", "hello-kitty", "kuromi", "miffy", "tamagotchi", "rilakkuma", "korilakkuma"];
  for (const slug of slugs) {
    const landing = characterLandingRail(landingTree, slug);
    assert.ok(landing, slug);
    assert.equal(
      landing.tiles.some((tile) => tile.slug === slug),
      true,
      slug,
    );
  }
});

test("an already visible tile does not move the rail", () => {
  assert.equal(
    railScrollLeft({
      scrollLeft: 0,
      clientWidth: 300,
      itemLeft: 20,
      itemWidth: 76,
    }),
    null,
  );
});

test("a tile past the right edge is centered", () => {
  const next = railScrollLeft({
    scrollLeft: 0,
    clientWidth: 200,
    itemLeft: 400,
    itemWidth: 80,
  });
  assert.equal(next, 340);
});

console.log(`\n${passed} look-rail checks passed`);

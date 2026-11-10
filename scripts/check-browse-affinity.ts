/**
 * Session affinity for "You may also like".
 *
 *   npx tsx scripts/check-browse-affinity.ts
 */
import assert from "node:assert/strict";
import {
  composeRelated,
  isShopSlug,
  leadingCharacter,
  shopCharacter,
} from "../src/lib/catalog/browse-affinity";
import { deviceOfProductType } from "../src/lib/catalog/devices";
import {
  parseRecentProducts,
  rememberRecentProduct,
  readRecentProducts,
} from "../src/lib/catalog/recently-viewed";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

const card = (id: number) => ({ id });
const NOW = 1_700_000_000_000;

function opened(id: number, characterSlug: string, minutesAgo: number) {
  return { id, characterSlug, seenAt: NOW - minutesAgo * 60_000 };
}

test("no history keeps the server rail", () => {
  const siblings = [1, 2, 3, 4, 5, 6, 7, 8].map(card);
  const next = composeRelated(siblings, [], {
    currentId: 99,
    recentIds: new Set(),
  });
  assert.deepEqual(
    next.map((item) => item.id),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
});

test("one earlier view does not pull another character forward", () => {
  assert.equal(
    leadingCharacter([opened(1, "kuromi", 1)], { id: 9, characterSlug: "hello-kitty" }, NOW),
    null,
  );
});

test("three views of another character lead the rail", () => {
  const history = [
    opened(1, "kuromi", 1),
    opened(2, "kuromi", 4),
    opened(3, "hello-kitty", 8),
    opened(4, "kuromi", 12),
  ];
  assert.equal(
    leadingCharacter(history, { id: 9, characterSlug: "hello-kitty" }, NOW),
    "kuromi",
  );
  assert.equal(
    leadingCharacter(history, { id: 9, characterSlug: "kuromi" }, NOW),
    null,
  );
});

test("a tie keeps the character viewed most recently", () => {
  const history = [
    opened(1, "miffy", 1),
    opened(2, "miffy", 3),
    opened(3, "miffy", 5),
    opened(4, "kuromi", 7),
    opened(5, "kuromi", 9),
    opened(6, "kuromi", 11),
  ];
  assert.equal(
    leadingCharacter(history, { id: 9, characterSlug: "hello-kitty" }, NOW),
    "miffy",
  );
});

test("the product on the page does not count as a view", () => {
  const history = [
    opened(9, "kuromi", 1),
    opened(1, "kuromi", 5),
    opened(2, "kuromi", 9),
  ];
  assert.equal(
    leadingCharacter(history, { id: 9, characterSlug: "hello-kitty" }, NOW),
    null,
  );
});

test("yesterday's browsing does not lead today's row", () => {
  const history = [
    opened(1, "kuromi", 26 * 60),
    opened(2, "kuromi", 26 * 60 + 5),
    opened(3, "kuromi", 26 * 60 + 10),
  ];
  assert.equal(
    leadingCharacter(history, { id: 9, characterSlug: "hello-kitty" }, NOW),
    null,
  );
});

test("a half-hour pause starts a new visit", () => {
  const history = [
    opened(1, "kuromi", 1),
    opened(2, "kuromi", 10),
    opened(3, "kuromi", 50),
  ];
  assert.equal(
    leadingCharacter(history, { id: 9, characterSlug: "hello-kitty" }, NOW),
    null,
  );
});

test("a long sitting still counts when each pause is short", () => {
  const history = [
    opened(1, "kuromi", 1),
    opened(2, "kuromi", 20),
    opened(3, "kuromi", 40),
  ];
  assert.equal(
    leadingCharacter(history, { id: 9, characterSlug: "hello-kitty" }, NOW),
    "kuromi",
  );
});

test("genre and feature shelves are not a browsed character", () => {
  assert.equal(
    shopCharacter([
      { slug: "kawaii", kind: "genre" },
      { slug: "magsafe", kind: "feature" },
    ]),
    null,
  );
  assert.equal(
    shopCharacter([
      { slug: "sanrio", kind: "brand" },
      { slug: "kuromi", kind: "character" },
    ]),
    "kuromi",
  );
  assert.equal(shopCharacter([{ slug: "miffy", kind: "brand" }]), "miffy");
  assert.equal(
    shopCharacter(
      [
        { slug: "hello-kitty", kind: "character", name: "Hello Kitty" },
        { slug: "kuromi", kind: "character", name: "Kuromi" },
      ],
      "Kuromi purple glitter case",
    ),
    "kuromi",
  );
  assert.equal(
    shopCharacter(
      [
        { slug: "hello-kitty", kind: "character", name: "Hello Kitty" },
        { slug: "kuromi", kind: "character", name: "Kuromi" },
      ],
      "Hello Kitty and Kuromi",
    ),
    "hello-kitty",
  );
});

test("the other character leads, then two cases from this page", () => {
  const siblings = [1, 2, 3, 4, 5, 6, 7, 8].map(card);
  const affinity = [11, 12, 13, 14, 15, 16, 17].map(card);
  const next = composeRelated(siblings, affinity, {
    currentId: 99,
    recentIds: new Set([11, 3]),
  });
  assert.deepEqual(
    next.map((item) => item.id),
    [12, 13, 14, 15, 16, 17, 1, 2],
  );
});

test("a thin affinity pool still fills the row from this page", () => {
  const siblings = [1, 2, 3, 4, 5, 6, 7, 8].map(card);
  const next = composeRelated(siblings, [11].map(card), {
    currentId: 99,
    recentIds: new Set(),
  });
  assert.deepEqual(
    next.map((item) => item.id),
    [11, 1, 2, 3, 4, 5, 6, 7],
  );
});

test("opened cases stay out until the row would be shorter than four", () => {
  const siblings = [1, 2, 3, 4, 5, 6, 7, 8].map(card);
  const next = composeRelated(siblings, [], {
    currentId: 99,
    recentIds: new Set([1, 2, 3, 4, 5, 6]),
  });
  assert.deepEqual(
    next.map((item) => item.id),
    [7, 8, 1, 2],
  );
});

test("the same case is never listed twice", () => {
  const shared = [1, 2, 3, 4].map(card);
  const next = composeRelated(shared, shared, {
    currentId: 99,
    recentIds: new Set(),
  });
  assert.deepEqual(
    next.map((item) => item.id),
    [1, 2, 3, 4],
  );
});

test("the row never grows past eight", () => {
  const next = composeRelated(
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map(card),
    [11, 12, 13, 14, 15, 16, 17, 18, 19].map(card),
    { currentId: 99, recentIds: new Set() },
  );
  assert.equal(next.length, 8);
  assert.deepEqual(
    next.map((item) => item.id),
    [11, 12, 13, 14, 15, 16, 1, 2],
  );
});

test("shop slugs reject paths and uppercase", () => {
  assert.equal(isShopSlug("hello-kitty"), true);
  assert.equal(isShopSlug("../admin"), false);
  assert.equal(isShopSlug("Hello"), false);
  assert.equal(isShopSlug(""), false);
  assert.equal(isShopSlug("a--b"), false);
});

test("a stored visit keeps the character and drops junk", () => {
  const memory = new Map<string, string>();
  const previous = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    },
  });
  try {
    const earlier = rememberRecentProduct({
      id: 7,
      slug: "kuromi-case",
      title: "Kuromi",
      price: "24.00",
      compareAtPrice: null,
      currency: "USD",
      imageUrl: null,
      productType: "iphone_case",
      characterSlug: "kuromi",
    });
    assert.deepEqual(earlier, []);
    const again = rememberRecentProduct({
      id: 8,
      slug: "hello-case",
      title: "Hello Kitty",
      price: "24.00",
      compareAtPrice: null,
      currency: "USD",
      imageUrl: null,
      productType: "not a type",
      characterSlug: "../kuromi",
    });
    assert.equal(again[0]?.characterSlug, "kuromi");
    const stored = readRecentProducts();
    assert.equal(stored[0]?.id, 8);
    assert.equal(stored[0]?.characterSlug, undefined);
    assert.equal(stored[0]?.productType, undefined);
    assert.equal(stored[1]?.characterSlug, "kuromi");
    assert.equal(stored[1]?.productType, "iphone_case");
    assert.equal(typeof stored[0]?.seenAt, "number");
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previous,
    });
  }
});

test("corrupt history is an empty visit list", () => {
  assert.deepEqual(parseRecentProducts("nope"), []);
  assert.deepEqual(parseRecentProducts(JSON.stringify([{ id: "x" }])), []);
  const [kept] = parseRecentProducts(
    JSON.stringify([
      { id: "x" },
      {
        id: 4,
        slug: "ok",
        title: "Ok",
        price: "1",
        compareAtPrice: null,
        currency: "USD",
        imageUrl: null,
        characterSlug: "miffy",
      },
    ]),
  );
  assert.equal(kept?.characterSlug, "miffy");
});

test("numbered iPhone and iPhone Duo stay on different devices", () => {
  assert.equal(deviceOfProductType("iphone_case")?.id, "iphone");
  assert.equal(deviceOfProductType("iphone_duo_case")?.id, "iphone-duo");
});

console.log(`\n${passed} checks passed`);

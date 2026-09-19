/**
 * Homepage collection-rail mix invariants.
 *
 *   tsx scripts/check-rail-mix.ts
 *
 * The failure mode this guards: uploading a batch of AirPods cases (or any
 * later product type) and watching Originals / Sanrio / Hello Kitty collapse
 * into a single-type strip because the rail was `ORDER BY created_at DESC
 * LIMIT 24`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  allocateTypeQuotas,
  merchandiseCollectionRail,
  selectDiverseRail,
  typeShareCap,
  type RailMixCandidate,
} from "../src/lib/catalog/rail-mix";

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

function candidate(
  partial: Partial<RailMixCandidate> & Pick<RailMixCandidate, "id" | "productType">,
): RailMixCandidate {
  return {
    featured: false,
    featuredPosition: null,
    createdAt: 0,
    ...partial,
  };
}

function many(
  productType: string,
  count: number,
  opts?: {
    idFrom?: number;
    createdAtFrom?: number;
    featuredCount?: number;
  },
): RailMixCandidate[] {
  const idFrom = opts?.idFrom ?? 1;
  const createdAtFrom = opts?.createdAtFrom ?? 0;
  const featuredCount = opts?.featuredCount ?? 0;
  return Array.from({ length: count }, (_, i) =>
    candidate({
      id: idFrom + i,
      productType,
      featured: i < featuredCount,
      featuredPosition: i < featuredCount ? i : null,
      createdAt: createdAtFrom + i,
    }),
  );
}

function histogram(items: { productType?: string | null }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.productType || "_unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function maxRun(items: { productType?: string | null }[]): number {
  let best = 0;
  let current = 0;
  let last = "";
  for (const item of items) {
    const key = item.productType || "_unknown";
    if (key === last) current += 1;
    else {
      last = key;
      current = 1;
    }
    if (current > best) best = current;
  }
  return best;
}

test("a monopoly cap of 1 type is 100%; 2 types cannot exceed 2/3", () => {
  assert.equal(typeShareCap(1), 1);
  assert.equal(typeShareCap(2), 2 / 3);
  assert.equal(typeShareCap(3), 0.5);
});

test("quotas always sum to min(limit, inventory)", () => {
  const cases: Array<[number[], number]> = [
    [[100, 100], 12],
    [[200, 20], 12],
    [[50, 50, 50], 12],
    [[11, 1], 12],
    [[1], 12],
    [[0, 10], 8],
    [[5, 5], 100],
    [[], 12],
  ];
  for (const [counts, limit] of cases) {
    const quotas = allocateTypeQuotas(counts, limit);
    const inventory = counts.reduce((sum, count) => sum + count, 0);
    assert.equal(
      quotas.reduce((sum, count) => sum + count, 0),
      Math.min(limit, inventory),
      `counts=${counts.join(",")} limit=${limit}`,
    );
    for (let i = 0; i < counts.length; i++) {
      assert.ok(quotas[i]! <= counts[i]!, `type ${i} over-allocated`);
    }
  }
});

test("a single stocked type receives every slot", () => {
  assert.deepEqual(allocateTypeQuotas([40], 12), [12]);
  const rail = merchandiseCollectionRail(many("airpod_case", 40), { limit: 12 });
  assert.equal(rail.length, 12);
  assert.ok(rail.every((item) => item.productType === "airpod_case"));
});

test("equal catalogs split a 12-slot rail evenly and alternate", () => {
  const quotas = allocateTypeQuotas([80, 80], 12);
  assert.deepEqual(quotas, [6, 6]);

  const rail = merchandiseCollectionRail(
    [
      ...many("iphone_case", 80, { idFrom: 1, createdAtFrom: 1_000 }),
      ...many("airpod_case", 80, { idFrom: 1_000, createdAtFrom: 2_000_000 }),
    ],
    { limit: 12 },
  );
  const counts = histogram(rail);
  assert.equal(counts.get("iphone_case"), 6);
  assert.equal(counts.get("airpod_case"), 6);
  assert.equal(maxRun(rail), 1, "equal types must not clump");
  for (let i = 1; i < rail.length; i++) {
    assert.notEqual(
      rail[i]?.productType,
      rail[i - 1]?.productType,
      "equal types must alternate",
    );
  }
});

test("bulk AirPods upload cannot paint a mixed collection AirPods-only", () => {
  // Newest 50 SKUs are AirPods; 80 older iPhone cases remain in the collection.
  const airpods = many("airpod_case", 50, {
    idFrom: 10_000,
    createdAtFrom: 2_000_000,
  });
  const iphones = many("iphone_case", 80, {
    idFrom: 1,
    createdAtFrom: 1_000,
    featuredCount: 4,
  });
  const rail = merchandiseCollectionRail([...airpods, ...iphones], { limit: 12 });

  assert.equal(rail.length, 12);
  const counts = histogram(rail);
  assert.ok((counts.get("iphone_case") ?? 0) >= 1, "iPhone cases must remain on the rail");
  assert.ok((counts.get("airpod_case") ?? 0) >= 1, "new AirPods still get discovery slots");
  assert.ok(
    (counts.get("airpod_case") ?? 0) <= Math.floor(12 * typeShareCap(2)),
    "AirPods must not monopolize the rail",
  );
  assert.ok(
    (counts.get("iphone_case") ?? 0) <= Math.floor(12 * typeShareCap(2)),
    "iPhone must not monopolize either",
  );

  // Newest-first LIMIT 12 would have been ids 10000–10011 (all AirPods).
  assert.ok(
    rail.some((item) => item.productType === "iphone_case"),
    "must not equal a createdAt DESC window",
  );
});

test("featured iPhone cases outrank older iPhone cases within their slots", () => {
  const rail = merchandiseCollectionRail(
    [
      ...many("airpod_case", 30, { idFrom: 500, createdAtFrom: 9_000_000 }),
      candidate({
        id: 1,
        productType: "iphone_case",
        featured: true,
        featuredPosition: 0,
        createdAt: 1,
      }),
      candidate({
        id: 2,
        productType: "iphone_case",
        featured: true,
        featuredPosition: 1,
        createdAt: 2,
      }),
      ...many("iphone_case", 20, { idFrom: 10, createdAtFrom: 100 }),
    ],
    { limit: 12 },
  );
  const iphones = rail.filter((item) => item.productType === "iphone_case");
  assert.ok(iphones.length >= 2);
  assert.equal(iphones[0]?.id, 1);
  assert.equal(iphones[1]?.id, 2);
});

test("a one-SKU minority type still appears on a 12-slot rail", () => {
  const rail = merchandiseCollectionRail(
    [
      ...many("iphone_case", 100, { idFrom: 1 }),
      candidate({ id: 9_001, productType: "airpod_case", createdAt: 9_999_999 }),
    ],
    { limit: 12 },
  );
  assert.equal(histogram(rail).get("airpod_case"), 1);
  assert.equal(rail.length, 12);
});

test("three stocked types each appear; none takes more than half", () => {
  const rail = merchandiseCollectionRail(
    [
      ...many("iphone_case", 40, { idFrom: 1 }),
      ...many("airpod_case", 25, { idFrom: 1_000 }),
      ...many("watch_band", 10, { idFrom: 2_000 }),
    ],
    { limit: 12 },
  );
  const counts = histogram(rail);
  assert.equal(counts.size, 3);
  for (const [, count] of counts) {
    assert.ok(count >= 1);
    assert.ok(count <= Math.floor(12 * typeShareCap(3)));
  }
  assert.equal(rail.length, 12);
});

test("a later product type (MacBook) is mixed without a code change", () => {
  const rail = merchandiseCollectionRail(
    [
      ...many("iphone_case", 30, { idFrom: 1 }),
      ...many("macbook_case", 30, { idFrom: 1_000, createdAtFrom: 8_000_000 }),
    ],
    { limit: 12 },
  );
  assert.ok((histogram(rail).get("macbook_case") ?? 0) >= 1);
  assert.ok((histogram(rail).get("iphone_case") ?? 0) >= 1);
});

test("empty and tiny candidate sets are safe", () => {
  assert.deepEqual(merchandiseCollectionRail([], { limit: 12 }), []);
  assert.deepEqual(merchandiseCollectionRail(many("iphone_case", 3), { limit: 12 }).length, 3);
  assert.deepEqual(merchandiseCollectionRail(many("iphone_case", 3), { limit: 0 }), []);
  assert.deepEqual(allocateTypeQuotas([], 12), []);
});

test("duplicate candidate ids are collapsed before mixing", () => {
  const dup = candidate({ id: 7, productType: "iphone_case", createdAt: 5 });
  const rail = merchandiseCollectionRail([dup, { ...dup, createdAt: 9 }, ...many("airpod_case", 5, { idFrom: 20 })], {
    limit: 12,
  });
  const ids = rail.map((item) => item.id);
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(ids.includes(7));
});

test("selectDiverseRail skips reserved ids and still mixes remaining types", () => {
  const items = [
    ...many("iphone_case", 8, { idFrom: 1 }).map((item) => ({
      ...item,
      imageUrl: `/p/${item.id}.webp`,
    })),
    ...many("airpod_case", 8, { idFrom: 100 }).map((item) => ({
      ...item,
      imageUrl: `/p/${item.id}.webp`,
    })),
  ];
  const usedIds = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
  const picked = selectDiverseRail(items, { limit: 8, usedIds, requireImage: true });
  assert.equal(picked.length, 8);
  assert.ok(picked.every((item) => item.productType === "airpod_case"));
  assert.ok(picked.every((item) => !usedIds.has(item.id)));
});

test("selectDiverseRail re-weaves after a partial reservation", () => {
  const items = [
    ...many("iphone_case", 6, { idFrom: 1 }).map((item) => ({
      ...item,
      imageUrl: `/p/${item.id}.webp`,
    })),
    ...many("airpod_case", 6, { idFrom: 100 }).map((item) => ({
      ...item,
      imageUrl: `/p/${item.id}.webp`,
    })),
  ];
  const usedIds = new Set([1, 2]);
  const picked = selectDiverseRail(items, { limit: 8, usedIds });
  const counts = histogram(picked);
  assert.ok((counts.get("iphone_case") ?? 0) >= 1);
  assert.ok((counts.get("airpod_case") ?? 0) >= 1);
  assert.ok(!picked.some((item) => item.id === 1 || item.id === 2));
});

test("selectDiverseRail drops imageless cards", () => {
  const picked = selectDiverseRail(
    [
      { id: 1, productType: "iphone_case", imageUrl: "/a.webp" },
      { id: 2, productType: "airpod_case", imageUrl: null },
      { id: 3, productType: "airpod_case", imageUrl: "/b.webp" },
    ],
    { limit: 4 },
  );
  assert.equal(picked.length, 2);
  assert.deepEqual(new Set(picked.map((item) => item.id)), new Set([1, 3]));
  assert.ok(!picked.some((item) => item.id === 2));
});

test("selectDiverseRail preserves within-type order from the caller", () => {
  const items = [
    { id: 2, productType: "iphone_case", imageUrl: "/2.webp" },
    { id: 1, productType: "iphone_case", imageUrl: "/1.webp" },
    { id: 10, productType: "airpod_case", imageUrl: "/10.webp" },
  ];
  const picked = selectDiverseRail(items, { limit: 3 });
  const iphones = picked.filter((item) => item.productType === "iphone_case");
  assert.deepEqual(
    iphones.map((item) => item.id),
    [2, 1],
  );
});

test("newest AirPods still occupy the AirPods slots (explore without monopoly)", () => {
  const olderAirpods = candidate({
    id: 50,
    productType: "airpod_case",
    createdAt: 10,
  });
  const newestAirpods = candidate({
    id: 51,
    productType: "airpod_case",
    createdAt: 99_999,
  });
  const rail = merchandiseCollectionRail(
    [olderAirpods, newestAirpods, ...many("iphone_case", 20, { idFrom: 1, createdAtFrom: 1 })],
    { limit: 12 },
  );
  const airpods = rail.filter((item) => item.productType === "airpod_case");
  assert.ok(airpods.length >= 1);
  assert.equal(airpods[0]?.id, 51);
});

test("homepage and catalog rail call the mixer (source contract)", () => {
  const productsSource = readFileSync("src/lib/products.ts", "utf8");
  const pageSource = readFileSync("src/app/(storefront)/page.tsx", "utf8");

  assert.match(productsSource, /collection-rail-v2/);

  const railStart = productsSource.indexOf("async function computeCollectionRail");
  assert.ok(railStart >= 0, "computeCollectionRail must exist");
  const railEnd = productsSource.indexOf("\nexport function ", railStart + 1);
  const railFn = productsSource.slice(
    railStart,
    railEnd === -1 ? undefined : railEnd,
  );
  assert.match(railFn, /merchandiseCollectionRail/);
  assert.doesNotMatch(railFn, /orderBy:\s*desc\(products\.createdAt\)/);

  assert.match(pageSource, /selectDiverseRail/);
  assert.match(pageSource, /RAIL_POOL = 48/);
  assert.match(pageSource, /title="Original designs"/);
  assert.match(pageSource, /title="The Sanrio Collection"/);
  assert.match(pageSource, /title="Hello Kitty Spotlight"/);
});

if (failed > 0) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`✓ rail mix invariants passed (${passed})`);

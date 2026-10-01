/**
 * Duplicate-matcher invariants — the failure modes that made the admin
 * "Find duplicates" report a 58-product "identical" group of unrelated
 * pastel phone cases.
 *
 *   tsx scripts/check-duplicates.ts
 *
 * Pure decision tests plus a few Sharp-built synthetic photos so the
 * fingerprint channels actually move when the artwork changes.
 */
import assert from "node:assert/strict";
import sharp from "sharp";

import {
  classifyVisual,
  fingerprintFromBuffer,
  hammingDistance,
  isNearDuplicate,
  parseFingerprint,
  visualDistances,
  HASH_LIMITS,
} from "../src/lib/catalog/phash";
import { isCurrentFingerprint } from "../src/lib/catalog/phash-types";
import {
  completeLinkageClusters,
  decidePair,
  distinctiveTokens,
  scoreTitle,
  type DuplicateIdentity,
} from "../src/lib/catalog/duplicate-match";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): void {
  tests.push({ name, fn });
}

const tests: { name: string; fn: () => void | Promise<void> }[] = [];

function fp(fill = "0"): string {
  const hex = fill.repeat(16).slice(0, 16);
  return `v2:${hex}${hex}${hex}${hex}`;
}

function identity(
  title: string,
  extra: Partial<DuplicateIdentity> = {},
): DuplicateIdentity {
  return { title, productType: "iphone_case", ...extra };
}

test("hamming distance is 0 for identical hex and 4 per differing nibble of 1111 vs 0000", () => {
  assert.equal(hammingDistance("0000", "0000"), 0);
  assert.equal(hammingDistance("ffff", "0000"), 16);
  assert.equal(hammingDistance("ffff", "ffff"), 0);
  assert.equal(hammingDistance("abc", "abcd"), 64);
  assert.equal(hammingDistance("", "aa"), 64);
});

test("v2 fingerprints parse and v1 16-char dHashes are rejected", () => {
  const raw = fp("a");
  const parsed = parseFingerprint(raw);
  assert.ok(parsed);
  assert.equal(parsed.dHashH.length, 16);
  assert.equal(parsed.raw, raw);
  assert.equal(parseFingerprint("a".repeat(16)), null);
  assert.equal(isCurrentFingerprint("a".repeat(16)), false);
  assert.equal(isCurrentFingerprint(raw), true);
  assert.equal(isCurrentFingerprint(null), false);
});

test("identical fingerprints of the same listing are an exact match", () => {
  const hash = fp("1");
  const a = identity("Hello Kitty Ice Cream Phone Case", {
    characterName: "Hello Kitty",
    brandName: "Sanrio",
  });
  const decision = decidePair([hash], [hash], a, a);
  assert.equal(decision.matched, true);
  assert.equal(decision.kind, "exact");
  assert.equal(decision.visual, "exact");
});

test("different characters block a strong visual candidate", () => {
  const a = `v2:${"0".repeat(64)}`;
  const b = `v2:${"0".repeat(32)}f${"0".repeat(31)}`;
  const decision = decidePair(
    [a],
    [b],
    identity("Kawaii Puppy Charm Phone Case with Beaded Strap for iPhone 18", {
      characterName: "Puppy",
    }),
    identity(
      "Hello Kitty pastel clear phone case with beaded charm for iPhone 18",
      { characterName: "Hello Kitty", brandName: "Sanrio" },
    ),
  );
  assert.equal(decision.matched, false);
  assert.equal(decision.rejectedBy, "character");
});

test("Rilakkuma vs elephant titles do not corroborate even with a shared 'clear'", () => {
  const score = scoreTitle(
    identity(
      "Mint Rilakkuma Clear Phone Case with 3D Flower Grip for iPhone 18 17 16 15 14 13 Pro Max — MagSafe",
      { characterName: "rilakkuma", brandName: "Rilakkuma" },
    ),
    identity(
      "Clear pastel phone case with blue elephant charm and beaded wrist strap for iPhone 18 17 16 15 Pro Max",
    ),
  );
  assert.equal(score.corroborates, false);
  assert.ok(score.intersection < 2);
});

test("two Miffy designs do not corroborate on the word Miffy alone", () => {
  const score = scoreTitle(
    identity("Miffy Starry MagSafe Clear Phone Case", {
      characterName: "Miffy",
      brandName: "Miffy",
    }),
    identity("Miffy Chef 360 Foldable Ring Case with Beaded Strap", {
      characterName: "Miffy",
      brandName: "Miffy",
    }),
  );
  assert.equal(score.corroborates, false);
});

test("the same listing retitled with an extra strap still corroborates", () => {
  const score = scoreTitle(
    identity("Hello Kitty pastel ice cream phone case", {
      characterName: "Hello Kitty",
      brandName: "Sanrio",
    }),
    identity("Hello Kitty pastel ice cream phone case with braided strap", {
      characterName: "Hello Kitty",
      brandName: "Sanrio",
    }),
  );
  assert.equal(score.corroborates, true);
  assert.ok(score.intersection >= 2);
});

test("exact visual with different characters is still rejected", () => {
  const hash = fp("a");
  const decision = decidePair(
    [hash],
    [hash],
    identity("Tamagotchi Kawaii Phone Case with Glitter", {
      characterName: "Tamagotchi",
      brandName: "Tamagotchi",
    }),
    identity("Stitch Skateboard PopSocket Phone Case", {
      characterName: "Stitch",
      brandName: "Disney",
    }),
  );
  assert.equal(decision.matched, false);
  assert.equal(decision.rejectedBy, "character");
});

test("iPhone vs AirPods is a hard type reject even on an exact hash", () => {
  const hash = fp("4");
  const decision = decidePair(
    [hash],
    [hash],
    identity("Pastel Blue Bow AirPods Case with Cloud Charm", {
      productType: "airpod_case",
    }),
    identity("Pastel Blue Bow Phone Case with Cloud Charm", {
      productType: "iphone_case",
    }),
  );
  assert.equal(decision.matched, false);
  assert.equal(decision.rejectedBy, "product_type");
});

test("strong visual without title overlap is rejected", () => {
  // Flip four pHash bits (one hex nibble 0→f): inside the strong band, not exact.
  const a = `v2:${"0".repeat(64)}`;
  const b = `v2:${"0".repeat(32)}f${"0".repeat(31)}`;
  const dist = visualDistances(parseFingerprint(a)!, parseFingerprint(b)!);
  assert.equal(dist.pHash, 4);
  assert.equal(dist.dHash, 0);
  assert.equal(classifyVisual(dist), "strong");
  const decision = decidePair(
    [a],
    [b],
    identity("Pixel girl polka dot case"),
    identity("Star ring stand case"),
  );
  assert.equal(decision.matched, false);
  assert.equal(decision.rejectedBy, "title");
});

test("complete-linkage does not chain A-B-C when A is not related to C", () => {
  // 0-1 and 1-2 related; 0-2 not. Union-find would emit {0,1,2}.
  const related = (i: number, j: number) => {
    const [x, y] = i < j ? [i, j] : [j, i];
    return (x === 0 && y === 1) || (x === 1 && y === 2);
  };
  const clusters = completeLinkageClusters(3, related);
  assert.equal(clusters.length, 1);
  assert.deepEqual([...clusters[0]!].sort(), [0, 1]);
});

test("complete-linkage emits a clique of three when every pair matches", () => {
  const clusters = completeLinkageClusters(3, () => true);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0]!.length, 3);
});

test("distinctive tokens drop catalogue filler and keep design words", () => {
  const tokens = distinctiveTokens(
    "Cute pastel clear phone case with beaded strap for iPhone 18 Pro Max — MagSafe",
  );
  assert.equal(tokens.has("phone"), false);
  assert.equal(tokens.has("case"), false);
  assert.equal(tokens.has("iphone"), false);
  assert.equal(tokens.has("magsafe"), false);
  assert.equal(tokens.has("beaded"), false);
  assert.ok(tokens.size === 0 || ![...tokens].some((t) => /^\d+$/.test(t)));
});

test("isNearDuplicate is exact-visual only", () => {
  const a = fp("0");
  const b = fp("0");
  assert.equal(isNearDuplicate(a, b), true);
  assert.equal(isNearDuplicate(a, "ffffffffffffffff"), false);
  assert.equal(isNearDuplicate("ffffffffffffffff", "ffffffffffffffff"), false);
});

test("HASH_LIMITS stay inside a 64-bit channel", () => {
  assert.ok(HASH_LIMITS.exact.dHash < HASH_LIMITS.strong.dHash);
  assert.ok(HASH_LIMITS.strong.pHash < 16);
});

async function paint(opts: {
  bg: { r: number; g: number; b: number };
  fg: { r: number; g: number; b: number };
  shape: "circle" | "rect";
}): Promise<Buffer> {
  const width = 400;
  const height = 800;
  const svg =
    opts.shape === "circle"
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
           <rect width="100%" height="100%" fill="rgb(${opts.bg.r},${opts.bg.g},${opts.bg.b})"/>
           <circle cx="200" cy="400" r="140" fill="rgb(${opts.fg.r},${opts.fg.g},${opts.fg.b})"/>
         </svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
           <rect width="100%" height="100%" fill="rgb(${opts.bg.r},${opts.bg.g},${opts.bg.b})"/>
           <rect x="80" y="220" width="240" height="360" fill="rgb(${opts.fg.r},${opts.fg.g},${opts.fg.b})"/>
         </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

test("the same artwork survives WebP recompress as an exact or strong visual match", async () => {
  const png = await paint({
    bg: { r: 250, g: 246, b: 252 },
    fg: { r: 255, g: 105, b: 180 },
    shape: "circle",
  });
  const soft = await sharp(png).blur(0.6).png().toBuffer();
  const webpA = await sharp(soft).webp({ quality: 82 }).toBuffer();
  const webpB = await sharp(soft).webp({ quality: 55 }).toBuffer();
  const ha = await fingerprintFromBuffer(webpA);
  const hb = await fingerprintFromBuffer(webpB);
  assert.ok(ha && hb);
  const dist = visualDistances(parseFingerprint(ha)!, parseFingerprint(hb)!);
  const kind = classifyVisual(dist);
  assert.ok(
    kind === "exact" || kind === "strong",
    `expected recompress to stay exact/strong, got ${kind} ${JSON.stringify(dist)}`,
  );
});

test("hashing the same buffer twice is byte-identical", async () => {
  const png = await paint({
    bg: { r: 240, g: 240, b: 245 },
    fg: { r: 180, g: 40, b: 90 },
    shape: "rect",
  });
  const a = await fingerprintFromBuffer(png);
  const b = await fingerprintFromBuffer(png);
  assert.ok(a);
  assert.equal(a, b);
});

test("two different artworks on the same studio sweep are not exact matches", async () => {
  const pink = await paint({
    bg: { r: 250, g: 246, b: 252 },
    fg: { r: 255, g: 105, b: 180 },
    shape: "circle",
  });
  const blue = await paint({
    bg: { r: 250, g: 246, b: 252 },
    fg: { r: 40, g: 90, b: 220 },
    shape: "rect",
  });
  const ha = await fingerprintFromBuffer(pink);
  const hb = await fingerprintFromBuffer(blue);
  assert.ok(ha && hb);
  assert.notEqual(ha, hb);
  const dist = visualDistances(parseFingerprint(ha)!, parseFingerprint(hb)!);
  assert.equal(classifyVisual(dist), "none");
  const decision = decidePair(
    [ha],
    [hb],
    identity("Hello Kitty Ice Cream Phone Case", {
      characterName: "Hello Kitty",
      brandName: "Sanrio",
    }),
    identity("Pastel Star Clear Phone Case with Ring Stand"),
  );
  assert.equal(decision.matched, false);
});

test("legacy dHash-only strings never count as near-duplicates", async () => {
  const png = await paint({
    bg: { r: 255, g: 255, b: 255 },
    fg: { r: 20, g: 20, b: 20 },
    shape: "rect",
  });
  const hash = await fingerprintFromBuffer(png);
  assert.ok(hash);
  const dHashOnly = parseFingerprint(hash)!.dHashH;
  assert.equal(isNearDuplicate(dHashOnly, dHashOnly), false);
});

async function main() {
  for (const t of tests) {
    try {
      await t.fn();
      passed += 1;
    } catch (err) {
      failed += 1;
      console.error(`  ✗ ${t.name}`);
      console.error(err instanceof Error ? err.stack : err);
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} duplicate check(s) failed, ${passed} passed.`);
    process.exit(1);
  }
  console.log(`Duplicate matcher invariants passed (${passed}).`);
}

void main();

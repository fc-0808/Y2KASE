/**
 * Style-classifier prompt invariants — AirPods vs iPhone offered sets.
 *
 *   tsx scripts/check-style-classify.ts
 *
 * Guards the failure mode that left every AirPods photo Universal: a
 * phone-case prompt that listed grip styles and never mentioned a ring charm.
 */
import assert from "node:assert/strict";

import {
  AIRPODS_STYLES,
  STYLES,
} from "../src/lib/pricing";
import {
  buildStyleClassifyPrompt,
  classifiedRawFor,
  coerceClassifiedStyle,
  resolvedOfferedStyles,
  styleClassifyKind,
  styleClassifyLabel,
} from "../src/lib/catalog/style-classify";

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

test("AirPods listings are the charm trio, never grip", () => {
  assert.equal(styleClassifyKind("airpod_case"), "airpods");
  assert.deepEqual(resolvedOfferedStyles("airpod_case"), [...AIRPODS_STYLES]);
  assert.equal(
    (resolvedOfferedStyles("airpod_case") as readonly string[]).includes(
      "Grip Only",
    ),
    false,
  );
});

test("the AirPods prompt lists only the three styles and forbids grip", () => {
  const prompt = buildStyleClassifyPrompt({ productType: "airpod_case" });
  for (const style of AIRPODS_STYLES) {
    assert.ok(prompt.includes(`"${style}"`), `missing ${style}`);
  }
  assert.doesNotMatch(prompt, /Case \+ Grip/);
  assert.doesNotMatch(prompt, /Grip Only/);
  assert.match(prompt, /AirPods/);
  assert.match(prompt, /ring clip/);
  assert.match(prompt, /never output a grip style/i);
  assert.match(prompt, /img_1/);
});

test("a grip label from the model cannot stick to an AirPods photo", () => {
  assert.deepEqual(
    coerceClassifiedStyle("Case + Grip", AIRPODS_STYLES),
    [],
  );
  assert.deepEqual(
    coerceClassifiedStyle("Case + Charm", AIRPODS_STYLES),
    ["Case + Charm"],
  );
  assert.deepEqual(
    coerceClassifiedStyle(["Case + Charm", "Case Only"], AIRPODS_STYLES),
    ["Case + Charm"],
  );
  assert.deepEqual(coerceClassifiedStyle(null, AIRPODS_STYLES), []);
});

test("iPhone listings still offer the six-style table", () => {
  assert.equal(styleClassifyKind("iphone_case"), "iphone");
  assert.deepEqual(resolvedOfferedStyles("iphone_case"), [...STYLES]);
  const prompt = buildStyleClassifyPrompt({ productType: "iphone_case" });
  assert.ok(prompt.includes("Case + Grip + Charm"));
  assert.ok(prompt.includes("Grip Only"));
  assert.doesNotMatch(prompt, /AirPods \/ AirPods Pro CASE/);
});

test("an iPhone listing that dropped grip is prompted without grip styles", () => {
  const offered = ["Case + Charm", "Case Only", "Charm Only"];
  const prompt = buildStyleClassifyPrompt({
    productType: "iphone_case",
    offeredStyles: offered,
  });
  assert.doesNotMatch(prompt, /Grip Only/);
  assert.match(prompt, /does not ship a grip/);
});

test("positional labels are monotonic and JSON lookup survives messy keys", () => {
  assert.equal(styleClassifyLabel(0), "img_1");
  assert.equal(styleClassifyLabel(3), "img_4");
  const parsed = {
    IMG_1: "Case + Charm",
    "id_99.webp": "Case Only",
  };
  assert.equal(classifiedRawFor(parsed, "img_1"), "Case + Charm");
  assert.equal(
    classifiedRawFor(parsed, "img_2", "id_99"),
    "Case Only",
  );
  assert.equal(classifiedRawFor(parsed, "img_3", "missing"), undefined);
});

test("model aliases and declines collapse onto the offered set", () => {
  assert.deepEqual(
    coerceClassifiedStyle("case and charm", AIRPODS_STYLES),
    ["Case + Charm"],
  );
  assert.deepEqual(
    coerceClassifiedStyle("universal", AIRPODS_STYLES),
    [],
  );
  assert.deepEqual(
    coerceClassifiedStyle({ style: "Case Only" }, AIRPODS_STYLES),
    ["Case Only"],
  );
});

if (failed > 0) {
  console.error(`\n${failed} style-classify check(s) failed, ${passed} passed.`);
  process.exit(1);
}
console.log(`Style-classify invariants passed (${passed}).`);

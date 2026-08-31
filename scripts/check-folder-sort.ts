/**
 * Self-check for the pre-ingest folder sorter.
 *
 *   npm run check:guards
 *
 * Pure decision table: where a QQ-dump folder goes, what listing.json keeps,
 * and that a vision outage never auto-files or auto-rejects. No network.
 */
import assert from "node:assert/strict";

import { EMPTY_BRAND_CLASSIFICATION } from "../src/lib/catalog/brands";
import {
  AUTO_FILE_MIN_CONFIDENCE,
  REJECTED_FOLDER,
  REVIEW_FOLDER,
  TYPE_DESTINATION,
  UNCLASSIFIED_FOLDER,
  buildClassificationRecord,
  collectionsForClassification,
  coerceRejectReason,
  decideSortAction,
  destCategoryFor,
  destRelativeFor,
  emptyVerdict,
  hashesMatch,
  isUnchangedClassification,
  mergeClassificationIntoListing,
  parseClassificationRecord,
  planFolderSort,
  sanitizeFolderSegment,
  uniqueDestLeaf,
  type IncomingFolderVerdict,
} from "../src/lib/catalog/folder-sort";
import {
  disabledThinkingParams,
  isThinkingParamRejected,
} from "../src/lib/llm-thinking";

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

function helloKitty(): IncomingFolderVerdict {
  return {
    isProduct: true,
    rejectReason: null,
    productTypeId: "iphone_case",
    brand: {
      brand: "Sanrio",
      character: "Hello Kitty",
      brandId: "sanrio",
      characterId: "hello-kitty",
      confidence: "high",
      evidence: ["bow, white cat face"],
    },
    confidence: "high",
    evidence: ["bow, white cat face"],
    failed: false,
  };
}

function genericCase(): IncomingFolderVerdict {
  return {
    isProduct: true,
    rejectReason: null,
    productTypeId: "iphone_case",
    brand: EMPTY_BRAND_CLASSIFICATION,
    confidence: "high",
    evidence: ["clear glitter case, no character"],
    failed: false,
  };
}

// ── Action table ────────────────────────────────────────────────────────────

test("a high-confidence product files", () => {
  assert.equal(decideSortAction(helloKitty()), "file");
});

test("medium confidence still auto-files (same bar as ingest)", () => {
  assert.equal(AUTO_FILE_MIN_CONFIDENCE, "medium");
  assert.equal(
    decideSortAction({
      isProduct: true,
      rejectReason: null,
      confidence: "medium",
      failed: false,
    }),
    "file",
  );
});

test("low confidence never auto-files", () => {
  assert.equal(
    decideSortAction({
      isProduct: true,
      rejectReason: null,
      confidence: "low",
      failed: false,
    }),
    "review",
  );
});

test("a vision outage fails closed to review, not reject or file", () => {
  const outage = emptyVerdict();
  assert.equal(outage.failed, true);
  assert.equal(decideSortAction(outage), "review");
  assert.notEqual(decideSortAction(outage), "reject");
  assert.notEqual(decideSortAction(outage), "file");
});

test("chat screenshots and QR codes are rejected, not filed as products", () => {
  assert.equal(
    decideSortAction({
      isProduct: false,
      rejectReason: "chat_screenshot",
      confidence: "high",
      failed: false,
    }),
    "reject",
  );
});

test("uncertain or unexplained non-products fail closed to review", () => {
  assert.equal(
    decideSortAction({
      isProduct: false,
      rejectReason: "unrelated",
      confidence: "low",
      failed: false,
    }),
    "review",
  );
  assert.equal(
    decideSortAction({
      isProduct: false,
      rejectReason: null,
      confidence: "high",
      failed: false,
    }),
    "review",
  );
});

test("an unknown rejectReason is dropped rather than inventing a bucket", () => {
  assert.equal(coerceRejectReason("chat_screenshot"), "chat_screenshot");
  assert.equal(coerceRejectReason("virus"), null);
  assert.equal(coerceRejectReason(1), null);
});

// ── Destinations ────────────────────────────────────────────────────────────

test("iPhone cases file under the brand display name", () => {
  const plan = planFolderSort({
    verdict: helloKitty(),
    sourceLeaf: "凯蒂猫001",
  });
  assert.equal(plan.action, "file");
  assert.equal(plan.destCategory, "Sanrio");
  assert.equal(plan.destRelative, "Sanrio/凯蒂猫001");
  assert.equal(plan.productTypeId, "iphone_case");
  assert.deepEqual(plan.collections, ["hello-kitty", "sanrio"]);
});

test("a generic high-confidence iPhone case files under Others", () => {
  const plan = planFolderSort({
    verdict: genericCase(),
    sourceLeaf: "新品12",
  });
  assert.equal(plan.destCategory, UNCLASSIFIED_FOLDER);
  assert.equal(plan.destRelative, "Others/新品12");
  assert.deepEqual(plan.collections, []);
});

test("AirPods cases file by type, not by brand, so ingest pins the type", () => {
  const plan = planFolderSort({
    verdict: {
      ...helloKitty(),
      productTypeId: "airpod_case",
    },
    sourceLeaf: "HK-pods",
  });
  assert.equal(plan.destCategory, TYPE_DESTINATION.airpod_case);
  assert.equal(plan.destRelative, "AirPods/HK-pods");
  assert.equal(plan.productTypeId, "airpod_case");
});

test("every non-iPhone type has a destination folder", () => {
  for (const id of [
    "samsung_case",
    "pixel_case",
    "airpod_case",
    "ipad_case",
    "macbook_case",
    "kindle_case",
    "watch_band",
    "apple_accessory",
  ]) {
    assert.ok(TYPE_DESTINATION[id], `${id} missing from TYPE_DESTINATION`);
  }
});

test("a vision outage is filed into _review, never Others or _rejected", () => {
  const plan = planFolderSort({
    verdict: emptyVerdict(),
    sourceLeaf: "mystery",
  });
  assert.equal(plan.action, "review");
  assert.equal(plan.destCategory, REVIEW_FOLDER);
  assert.equal(plan.destRelative, "_review/mystery");
});

test("low-confidence products land in _review, keeping the original leaf", () => {
  const plan = planFolderSort({
    verdict: { ...helloKitty(), confidence: "low" },
    sourceLeaf: "maybe-kuromi",
  });
  assert.equal(plan.action, "review");
  assert.equal(plan.destCategory, REVIEW_FOLDER);
  assert.equal(plan.destRelative, "_review/maybe-kuromi");
});

test("junk lands in _rejected", () => {
  const plan = planFolderSort({
    verdict: {
      isProduct: false,
      rejectReason: "chat_screenshot",
      productTypeId: "iphone_case",
      brand: EMPTY_BRAND_CLASSIFICATION,
      confidence: "high",
      evidence: ["QQ chat bubbles"],
      failed: false,
    },
    sourceLeaf: "screenshot",
  });
  assert.equal(plan.action, "reject");
  assert.equal(plan.destCategory, REJECTED_FOLDER);
  assert.equal(plan.destRelative, "_rejected/screenshot");
});

test("a character assignment walks the taxonomy chain (Kuromi → Sanrio)", () => {
  assert.deepEqual(collectionsForClassification("sanrio", "kuromi"), [
    "kuromi",
    "sanrio",
  ]);
});

test("an unknown type id falls back to iphone_case rather than inventing a folder", () => {
  const plan = planFolderSort({
    verdict: { ...helloKitty(), productTypeId: "toaster" },
    sourceLeaf: "x",
  });
  assert.equal(plan.productTypeId, "iphone_case");
  assert.equal(plan.destCategory, "Sanrio");
});

// ── Filename safety ─────────────────────────────────────────────────────────

test("Windows-illegal characters are stripped; Chinese names are kept", () => {
  assert.equal(sanitizeFolderSegment("凯蒂猫:新品?"), "凯蒂猫_新品_");
  assert.equal(sanitizeFolderSegment("hello/kitty"), "hello_kitty");
  assert.equal(sanitizeFolderSegment("  dots...  "), "dots");
  assert.equal(sanitizeFolderSegment("CON"), "CON_");
  assert.equal(sanitizeFolderSegment(""), "product");
});

test("collision suffixes use __n so they cannot be mistaken for a SKU -2", () => {
  const taken = new Set(["kitty", "kitty__2"]);
  assert.equal(uniqueDestLeaf("kitty", taken), "kitty__3");
  assert.equal(uniqueDestLeaf("fresh", taken), "fresh");
});

test("destRelativeFor always sanitises the leaf", () => {
  assert.equal(
    destRelativeFor("Sanrio", "a:b"),
    "Sanrio/a_b",
  );
  assert.equal(destCategoryFor("file", "iphone_case", null), UNCLASSIFIED_FOLDER);
});

// ── listing.json merge ──────────────────────────────────────────────────────

test("merge fills productType and collections without wiping a human title", () => {
  const plan = planFolderSort({
    verdict: helloKitty(),
    sourceLeaf: "bow",
  });
  const merged = mergeClassificationIntoListing(
    { title: "Keep this", productType: "airpod_case", collections: ["kawaii"] },
    plan,
    buildClassificationRecord({
      model: "qwen/qwen3.8-flash",
      plan,
      verdict: helloKitty(),
      imageHashes: ["abc"],
      at: "2026-08-28T00:00:00.000Z",
    }),
  );
  assert.equal(merged.title, "Keep this");
  // Human-pinned type wins — the classifier must not override it.
  assert.equal(merged.productType, "airpod_case");
  const collections = merged.collections as string[];
  assert.ok(collections.includes("kawaii"));
  assert.ok(collections.includes("hello-kitty"));
  assert.ok(collections.includes("sanrio"));
});

test("merge writes productType when the listing did not pin one", () => {
  const plan = planFolderSort({
    verdict: helloKitty(),
    sourceLeaf: "bow",
  });
  const merged = mergeClassificationIntoListing(
    null,
    plan,
    buildClassificationRecord({
      model: "qwen/qwen3.8-flash",
      plan,
      verdict: helloKitty(),
      imageHashes: ["abc"],
    }),
  );
  assert.equal(merged.productType, "iphone_case");
});

test("parseClassificationRecord rejects a stale or truncated sidecar", () => {
  assert.equal(parseClassificationRecord(null), null);
  assert.equal(parseClassificationRecord({ version: 1 }), null);
  const plan = planFolderSort({
    verdict: helloKitty(),
    sourceLeaf: "bow",
  });
  const record = buildClassificationRecord({
    model: "qwen/qwen3.8-flash",
    plan,
    verdict: helloKitty(),
    imageHashes: ["aa", "bb"],
    at: "2026-08-28T00:00:00.000Z",
  });
  const parsed = parseClassificationRecord(record);
  assert.ok(parsed);
  assert.equal(parsed?.action, "file");
  assert.deepEqual(parsed?.imageHashes, ["aa", "bb"]);
});

test("unchanged classification is a no-op only when hashes and path both match", () => {
  const plan = planFolderSort({
    verdict: helloKitty(),
    sourceLeaf: "bow",
  });
  const record = buildClassificationRecord({
    model: "qwen/qwen3.8-flash",
    plan,
    verdict: helloKitty(),
    imageHashes: ["aa"],
    at: "2026-08-28T00:00:00.000Z",
  });
  assert.equal(
    isUnchangedClassification(record, ["aa"], "Sanrio/bow", "Sanrio/bow"),
    true,
  );
  assert.equal(
    isUnchangedClassification(record, ["aa"], "Others/bow", "Sanrio/bow"),
    false,
  );
  assert.equal(
    isUnchangedClassification(record, ["cc"], "Sanrio/bow", "Sanrio/bow"),
    false,
  );
});

test("hashesMatch is order-sensitive (gallery order is identity)", () => {
  assert.equal(hashesMatch(["a", "b"], ["a", "b"]), true);
  assert.equal(hashesMatch(["a", "b"], ["b", "a"]), false);
  assert.equal(hashesMatch(["a"], ["a", "b"]), false);
});

// ── Qwen provider controls ──────────────────────────────────────────────────

test("Qwen thinking controls match each provider's wire format", () => {
  assert.deepEqual(
    disabledThinkingParams(
      "qwen/qwen3.8-flash",
      "https://openrouter.ai/api/v1",
    ),
    { reasoning: { effort: "none" } },
  );
  assert.deepEqual(
    disabledThinkingParams(
      "qwen3.8-flash",
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    ),
    { enable_thinking: false },
  );
  assert.deepEqual(
    disabledThinkingParams("Qwen/Qwen3.8-27B", "http://localhost:8000/v1"),
    { chat_template_kwargs: { enable_thinking: false } },
  );
});

test("non-Qwen models receive no vendor-specific thinking parameters", () => {
  assert.deepEqual(
    disabledThinkingParams("gpt-5.4-mini", "https://api.openai.com/v1"),
    {},
  );
});

test("thinking-parameter rejection detection recognizes provider errors", () => {
  assert.equal(
    isThinkingParamRejected(
      new Error("Unknown parameter: chat_template_kwargs"),
    ),
    true,
  );
  assert.equal(isThinkingParamRejected(new Error("Rate limit exceeded")), false);
});

console.log(
  failed === 0
    ? `\n  ✓ folder-sort: ${passed} checks passed\n`
    : `\n  ✗ folder-sort: ${failed} failed, ${passed} passed\n`,
);
process.exit(failed === 0 ? 0 : 1);

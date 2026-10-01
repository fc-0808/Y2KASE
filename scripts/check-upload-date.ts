/**
 * Upload-date facet: civil days in Asia/Shanghai, windows, and sort order.
 *
 *   tsx scripts/check-upload-date.ts
 */
import assert from "node:assert/strict";
import {
  compareProductsByUpload,
  countInWindow,
  formatUploadDay,
  formatUploadTime,
  matchesUploadWindow,
  parseUploadSort,
  parseUploadWindow,
  shiftUploadDay,
  uploadBatches,
  uploadDayKey,
  uploadDayLabel,
  uploadWindowParam,
  uploadWindowSummary,
} from "../src/lib/admin/upload-date";

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

const TODAY = "2026-09-22";
/** 2026-09-21 16:00 UTC is midnight at the start of Sep 22 in Shanghai. */
const SHANGHAI_SEP22_START = "2026-09-21T16:00:00.000Z";
/** One minute earlier is still Sep 21 in Shanghai. */
const SHANGHAI_SEP21_END = "2026-09-21T15:59:00.000Z";
const SHANGHAI_SEP22_AFTERNOON = "2026-09-22T06:06:00.000Z";

function row(id: number, createdAt: string, status = "draft") {
  return { id, createdAt, status };
}

test("buckets instants on the Shanghai civil date, including the midnight boundary", () => {
  assert.equal(uploadDayKey(SHANGHAI_SEP22_START), "2026-09-22");
  assert.equal(uploadDayKey(SHANGHAI_SEP21_END), "2026-09-21");
  assert.equal(uploadDayKey(SHANGHAI_SEP22_AFTERNOON), "2026-09-22");
  assert.equal(uploadDayKey("not-a-date"), "");
});

test("shifts civil dates without crossing a timezone", () => {
  assert.equal(shiftUploadDay("2026-09-01", -1), "2026-08-31");
  assert.equal(shiftUploadDay("2026-03-01", -1), "2026-02-28");
  assert.equal(uploadDayLabel("2026-09-22", TODAY), "Today");
  assert.equal(uploadDayLabel("2026-09-21", TODAY), "Yesterday");
  assert.equal(uploadDayLabel("2026-09-18", TODAY), "Sep 18");
});

test("formats the stamp in Shanghai local time", () => {
  assert.equal(formatUploadDay(SHANGHAI_SEP22_AFTERNOON), "Sep 22");
  assert.match(formatUploadTime(SHANGHAI_SEP22_AFTERNOON), /2:06/);
});

test("parses and serializes windows, rejecting impossible dates", () => {
  assert.deepEqual(parseUploadWindow(undefined), { kind: "all" });
  assert.deepEqual(parseUploadWindow("today"), { kind: "today" });
  assert.deepEqual(parseUploadWindow("7d"), { kind: "7d" });
  assert.deepEqual(parseUploadWindow("30d"), { kind: "30d" });
  assert.deepEqual(parseUploadWindow("2026-09-22"), {
    kind: "day",
    day: "2026-09-22",
  });
  assert.deepEqual(parseUploadWindow("2026-02-31"), { kind: "all" });
  assert.deepEqual(parseUploadWindow("nope"), { kind: "all" });
  assert.equal(uploadWindowParam({ kind: "all" }), null);
  assert.equal(uploadWindowParam({ kind: "7d" }), "7d");
  assert.equal(uploadWindowParam({ kind: "day", day: "2026-09-22" }), "2026-09-22");
  assert.equal(parseUploadSort("newest"), "newest");
  assert.equal(parseUploadSort("sideways"), "review");
});

test("matches calendar windows, inclusive of today", () => {
  const weekOld = "2026-09-16T04:00:00.000Z"; // Sep 16 Shanghai
  const eightDays = "2026-09-14T04:00:00.000Z"; // Sep 14 Shanghai
  assert.equal(
    matchesUploadWindow(SHANGHAI_SEP22_AFTERNOON, { kind: "today" }, TODAY),
    true,
  );
  assert.equal(
    matchesUploadWindow(SHANGHAI_SEP21_END, { kind: "today" }, TODAY),
    false,
  );
  assert.equal(matchesUploadWindow(weekOld, { kind: "7d" }, TODAY), true);
  assert.equal(matchesUploadWindow(eightDays, { kind: "7d" }, TODAY), false);
  assert.equal(matchesUploadWindow(eightDays, { kind: "30d" }, TODAY), true);
  assert.equal(
    matchesUploadWindow(SHANGHAI_SEP22_START, { kind: "day", day: TODAY }, TODAY),
    true,
  );
  assert.equal(matchesUploadWindow("nope", { kind: "today" }, TODAY), false);
  assert.equal(matchesUploadWindow("nope", { kind: "all" }, TODAY), true);
});

test("groups batches newest first and counts a window", () => {
  const items = [
    row(1, SHANGHAI_SEP21_END),
    row(2, SHANGHAI_SEP22_START),
    row(3, SHANGHAI_SEP22_AFTERNOON),
  ];
  const batches = uploadBatches(items, TODAY);
  assert.deepEqual(
    batches.map((batch) => [batch.day, batch.count, batch.label]),
    [
      ["2026-09-22", 2, "Today"],
      ["2026-09-21", 1, "Yesterday"],
    ],
  );
  assert.equal(countInWindow(items, { kind: "today" }, TODAY), 2);
});

test("sorts drafts first in review order, and purely by time otherwise", () => {
  const older = row(1, "2026-09-20T04:00:00.000Z", "active");
  const newerDraft = row(2, SHANGHAI_SEP22_AFTERNOON, "draft");
  const sameTimeLaterId = row(3, SHANGHAI_SEP22_AFTERNOON, "active");
  assert.ok(compareProductsByUpload(newerDraft, older, "review") < 0);
  assert.ok(compareProductsByUpload(newerDraft, older, "newest") < 0);
  assert.ok(compareProductsByUpload(older, newerDraft, "oldest") < 0);
  assert.ok(compareProductsByUpload(sameTimeLaterId, newerDraft, "newest") < 0);
  assert.equal(uploadWindowSummary({ kind: "day", day: TODAY }), "uploaded on September 22, 2026");
});

if (failed > 0) {
  console.error(`\n${failed} upload-date check(s) failed, ${passed} passed.`);
  process.exit(1);
}
console.log(`Upload date invariants passed (${passed}).`);

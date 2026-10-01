/**
 * Previous / Redo for generated thumbnails. A new preview parks the one it
 * replaced; Previous restores it and Redo brings the newer one back.
 *
 *   tsx scripts/check-thumbnail-history.ts
 */
import assert from "node:assert/strict";
import {
  THUMBNAIL_URL_HISTORY_CAP,
  pushThumbnailUrl,
  stepThumbnailUrl,
  type ThumbnailUrlHistory,
} from "../src/lib/admin/thumbnail-history";

const empty: ThumbnailUrlHistory = {
  proposalUrl: null,
  previousUrls: [],
  nextUrls: [],
};

const first = pushThumbnailUrl(empty, "a.webp");
assert.deepEqual(first, {
  proposalUrl: "a.webp",
  previousUrls: [],
  nextUrls: [],
});

const second = pushThumbnailUrl(first, "b.webp");
assert.deepEqual(second, {
  proposalUrl: "b.webp",
  previousUrls: ["a.webp"],
  nextUrls: [],
});

// Writing the same URL must not wipe a redo stack or duplicate history.
const kept = pushThumbnailUrl(
  { proposalUrl: "b.webp", previousUrls: ["a.webp"], nextUrls: ["c.webp"] },
  "b.webp",
);
assert.deepEqual(kept.nextUrls, ["c.webp"]);
assert.deepEqual(kept.previousUrls, ["a.webp"]);

const undone = stepThumbnailUrl(second, "previous");
assert.deepEqual(undone, {
  proposalUrl: "a.webp",
  previousUrls: [],
  nextUrls: ["b.webp"],
});
assert.equal(stepThumbnailUrl(undone!, "previous"), null);

const redone = stepThumbnailUrl(undone!, "redo");
assert.deepEqual(redone, second);
assert.equal(stepThumbnailUrl(redone!, "redo"), null);

// A new preview after undo drops the redo stack.
const replaced = pushThumbnailUrl(undone!, "c.webp");
assert.deepEqual(replaced, {
  proposalUrl: "c.webp",
  previousUrls: ["a.webp"],
  nextUrls: [],
});

const long = Array.from(
  { length: THUMBNAIL_URL_HISTORY_CAP + 3 },
  (_, i) => `${i}.webp`,
);
let history = empty;
for (const url of long) history = pushThumbnailUrl(history, url);
assert.equal(history.previousUrls.length, THUMBNAIL_URL_HISTORY_CAP);
assert.equal(history.previousUrls[0], "2.webp");
assert.equal(history.proposalUrl, long[long.length - 1]);

// Re-saving the same URL (including null) keeps the redo stack and drops junk.
const cleaned = pushThumbnailUrl(
  {
    proposalUrl: null,
    previousUrls: ["ok.webp", "", 4 as unknown as string],
    nextUrls: ["stale.webp"],
  },
  null,
);
assert.deepEqual(cleaned, {
  proposalUrl: null,
  previousUrls: ["ok.webp"],
  nextUrls: ["stale.webp"],
});

// Clearing a real preview still parks it and drops redo.
const cleared = pushThumbnailUrl(
  { proposalUrl: "b.webp", previousUrls: ["a.webp"], nextUrls: ["c.webp"] },
  null,
);
assert.deepEqual(cleared, {
  proposalUrl: null,
  previousUrls: ["a.webp", "b.webp"],
  nextUrls: [],
});

console.log("Thumbnail history invariants passed.");

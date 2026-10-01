/**
 * The product editor's thumbnail studio must offer exactly the per-product
 * actions the review board offers — and no action the server would reject.
 *
 *   tsx scripts/check-thumbnail-studio.ts
 */
import assert from "node:assert/strict";
import { NORMALIZED_THUMBNAIL_SOURCE } from "../src/lib/db/schema";
import {
  NORMALIZED_THUMBNAIL_FILENAME,
  actionsForThumbnailPhase,
  isNormalizedListingThumbnail,
  primaryThumbnailAction,
  thumbnailActionBlock,
  thumbnailStudioPhase,
  thumbnailStudioShowsProposal,
  type ThumbnailProposalView,
  type ThumbnailStudioAction,
  type ThumbnailStudioPhase,
} from "../src/lib/admin/thumbnail-studio";

const preview = "https://example.com/proposal.webp";

function proposal(
  status: string,
  proposalUrl: string | null = preview,
): ThumbnailProposalView {
  return {
    status,
    proposalUrl,
    previousCount: 0,
    nextCount: 0,
    score: 0.91,
    category: "clean_product",
    reason: "clean",
  };
}

function includes(
  phase: ThumbnailStudioPhase,
  action: ThumbnailStudioAction,
): boolean {
  return actionsForThumbnailPhase(phase).includes(action);
}

assert.equal(thumbnailStudioPhase(null), "pending");
assert.equal(thumbnailStudioPhase(proposal("proposed")), "review");
assert.equal(thumbnailStudioPhase(proposal("proposed", null)), "broken");
assert.equal(thumbnailStudioPhase(proposal("flagged", null)), "flagged");
assert.equal(thumbnailStudioPhase(proposal("approved")), "live");
assert.equal(thumbnailStudioPhase(proposal("skipped", null)), "skipped");
assert.equal(thumbnailStudioPhase(proposal("nope")), "broken");

assert.deepEqual(actionsForThumbnailPhase("pending"), ["generate", "upload"]);
assert.deepEqual(actionsForThumbnailPhase("review"), [
  "approve",
  "regenerate",
  "restorePrevious",
  "redo",
  "removeBackground",
  "removeTag",
  "adjust",
  "flag",
  "skip",
  "upload",
]);
assert.deepEqual(actionsForThumbnailPhase("flagged"), [
  "regenerate",
  "restorePrevious",
  "redo",
  "skip",
  "upload",
]);
assert.deepEqual(actionsForThumbnailPhase("live"), [
  "regenerate",
  "removeBackground",
  "removeTag",
  "upload",
]);
assert.deepEqual(actionsForThumbnailPhase("skipped"), ["generate", "upload"]);
assert.deepEqual(actionsForThumbnailPhase("broken"), [
  "generate",
  "regenerate",
  "upload",
]);

for (const phase of [
  "pending",
  "review",
  "flagged",
  "live",
  "skipped",
  "broken",
] as const) {
  const actions = actionsForThumbnailPhase(phase);
  assert.equal(new Set(actions).size, actions.length, `${phase} has a duplicate`);
  assert.ok(
    actions.includes(primaryThumbnailAction(phase)),
    `${phase} primary is not in its action list`,
  );
  assert.equal(actions.includes("upload"), true, `${phase} can upload`);
}

assert.equal(includes("review", "approve"), true);
assert.equal(includes("live", "approve"), false);
assert.equal(includes("flagged", "approve"), false);
assert.equal(includes("flagged", "adjust"), false);
assert.equal(includes("live", "adjust"), false);
assert.equal(includes("live", "removeBackground"), true);
assert.equal(includes("pending", "regenerate"), false);

assert.equal(thumbnailStudioShowsProposal("review", preview, preview), true);
assert.equal(thumbnailStudioShowsProposal("flagged", preview, preview), true);
assert.equal(thumbnailStudioShowsProposal("flagged", preview, null), false);
assert.equal(thumbnailStudioShowsProposal("live", preview, preview), false);
assert.equal(
  thumbnailStudioShowsProposal("live", "https://example.com/other.webp", preview),
  true,
);
assert.equal(thumbnailStudioShowsProposal("pending", preview, null), false);
assert.equal(thumbnailStudioShowsProposal("skipped", preview, null), false);

assert.equal(thumbnailActionBlock("generate", null, null), "This product has no photos to generate from.");
assert.equal(thumbnailActionBlock("generate", preview, null), null);
assert.equal(thumbnailActionBlock("adjust", preview, null), "No preview to edit yet.");
assert.equal(thumbnailActionBlock("adjust", preview, preview), null);
assert.equal(thumbnailActionBlock("upload", null, null), null);
assert.equal(
  thumbnailActionBlock("restorePrevious", preview, preview),
  "No previous thumbnail yet. It appears after this preview is replaced.",
);
assert.equal(
  thumbnailActionBlock("restorePrevious", preview, preview, {
    previous: 1,
    next: 0,
  }),
  null,
);
assert.equal(
  thumbnailActionBlock("redo", preview, preview, { previous: 1, next: 0 }),
  "Nothing to redo. Previous parks the thumbnail you leave here.",
);
assert.equal(
  thumbnailActionBlock("redo", preview, preview, { previous: 0, next: 1 }),
  null,
);

assert.equal(NORMALIZED_THUMBNAIL_FILENAME, NORMALIZED_THUMBNAIL_SOURCE);
assert.equal(isNormalizedListingThumbnail(NORMALIZED_THUMBNAIL_SOURCE), true);
assert.equal(isNormalizedListingThumbnail("IMG_2201"), false);
assert.equal(isNormalizedListingThumbnail(null), false);

console.log("Thumbnail studio invariants passed.");

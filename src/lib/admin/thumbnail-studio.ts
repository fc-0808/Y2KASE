/**
 * Per-product thumbnail studio.
 *
 * `/admin/products/thumbnails` is a catalogue-wide review board. The product
 * editor needs the same decisions for one listing: view the thumbnail shoppers
 * see, and run every action that board would offer that product.
 *
 * The action matrix below is that contract. Batch tools (scope, generate-all,
 * multi-select) stay on the board — they are not properties of one product.
 * If a per-product button is added there, add it here too.
 *
 * This file stays free of DB and Node imports. The editor (client) and the
 * loader (server) both need the vocabulary.
 */

export const THUMBNAIL_STUDIO_ACTIONS = [
  "generate",
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
] as const;

export type ThumbnailStudioAction = (typeof THUMBNAIL_STUDIO_ACTIONS)[number];

/**
 * `review` is the board's "To review" card.
 * `flagged` is "Needs attention".
 * `live` is "Live thumbnails".
 * `pending` is "Not started".
 * `skipped` is counted on the board but not listed — recovery is generate or upload.
 * `broken` is a `proposed` row with no preview. The board hides those; the
 * editor still has to offer a way back.
 */
export const THUMBNAIL_STUDIO_PHASES = [
  "pending",
  "review",
  "flagged",
  "live",
  "skipped",
  "broken",
] as const;

export type ThumbnailStudioPhase = (typeof THUMBNAIL_STUDIO_PHASES)[number];

/** One product's proposal, or `null` when generation has never been run. */
export type ThumbnailProposalView = {
  /** `proposed` | `approved` | `flagged` | `skipped`, or an unexpected stored value. */
  status: string;
  proposalUrl: string | null;
  /** Replaced previews Previous can restore. */
  previousCount: number;
  /** Previews Redo can bring back after Previous. */
  nextCount: number;
  score: number | null;
  category: string | null;
  reason: string | null;
};

/**
 * `product_images.source_filename` of an approved normalized thumbnail.
 *
 * The database constant is `NORMALIZED_THUMBNAIL_SOURCE` in the schema. This
 * copy exists so the product editor can read it without pulling Drizzle into
 * the client bundle. `scripts/check-thumbnail-studio.ts` fails if they diverge.
 */
export const NORMALIZED_THUMBNAIL_FILENAME = "thumbnail-normalized";

export function isNormalizedListingThumbnail(filename: string | null): boolean {
  return filename === NORMALIZED_THUMBNAIL_FILENAME;
}

export function thumbnailStudioPhase(
  proposal: ThumbnailProposalView | null,
): ThumbnailStudioPhase {
  if (!proposal) return "pending";
  switch (proposal.status) {
    case "proposed":
      return proposal.proposalUrl ? "review" : "broken";
    case "flagged":
      return "flagged";
    case "approved":
      return "live";
    case "skipped":
      return "skipped";
    default:
      return "broken";
  }
}

/**
 * Actions the review board renders for a product in this phase.
 *
 * Order is the order the editor shows them. `approveProposal` rejects anything
 * that is not a `proposed` row with a preview, so Approve exists only in
 * `review`. Remove-background, remove-tag, and crop all rewrite the preview
 * and send it back to review — the board offers the first two on live cards
 * and all three on the proposal card.
 */
const PHASE_ACTIONS: Record<
  ThumbnailStudioPhase,
  readonly ThumbnailStudioAction[]
> = {
  pending: ["generate", "upload"],
  review: [
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
  ],
  flagged: ["regenerate", "restorePrevious", "redo", "skip", "upload"],
  live: ["regenerate", "removeBackground", "removeTag", "upload"],
  skipped: ["generate", "upload"],
  broken: ["generate", "regenerate", "upload"],
};

export function actionsForThumbnailPhase(
  phase: ThumbnailStudioPhase,
): readonly ThumbnailStudioAction[] {
  return PHASE_ACTIONS[phase];
}

/** The button the board draws as the filled primary action for this phase. */
export function primaryThumbnailAction(
  phase: ThumbnailStudioPhase,
): ThumbnailStudioAction {
  switch (phase) {
    case "review":
      return "approve";
    case "flagged":
    case "live":
      return "regenerate";
    case "pending":
    case "skipped":
    case "broken":
      return "generate";
  }
}

/**
 * Second pane.
 *
 * A reviewable proposal is always compared with the listing image. A human
 * flag keeps its preview URL; the board's small card only draws the current
 * photo, but the editor shows that preview so the rejection is visible.
 * An approved file is copied into gallery position 0, so a second pane only
 * helps once the listing image has moved.
 */
export function thumbnailStudioShowsProposal(
  phase: ThumbnailStudioPhase,
  currentUrl: string | null,
  proposalUrl: string | null,
): boolean {
  if (!proposalUrl) return false;
  if (phase === "review" || phase === "flagged") return true;
  if (phase === "live") return proposalUrl !== currentUrl;
  return false;
}

/**
 * Generate and Regenerate read the product's gallery. Crop and background
 * tools read the preview URL. Upload does not need either.
 */
export function thumbnailActionBlock(
  action: ThumbnailStudioAction,
  currentUrl: string | null,
  proposalUrl: string | null,
  history?: { previous: number; next: number },
): string | null {
  if (
    (action === "generate" || action === "regenerate") &&
    !currentUrl
  ) {
    return "This product has no photos to generate from.";
  }
  if (
    (action === "removeBackground" ||
      action === "removeTag" ||
      action === "adjust") &&
    !proposalUrl
  ) {
    return "No preview to edit yet.";
  }
  if (action === "restorePrevious" && !(history?.previous)) {
    return "No previous thumbnail yet. It appears after this preview is replaced.";
  }
  if (action === "redo" && !(history?.next)) {
    return "Nothing to redo. Previous parks the thumbnail you leave here.";
  }
  return null;
}

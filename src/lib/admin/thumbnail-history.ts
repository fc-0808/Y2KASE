/**
 * Undo / redo stack for generated thumbnail previews.
 *
 * Each new preview (generate, regenerate, crop, background removal, upload)
 * pushes the URL it replaced. Previous restores that URL; Redo brings back
 * the one you left. Pure so the review board and the database writer share
 * one definition of the stack.
 */

/** How many replaced previews we keep. Older files stay in storage but drop
 *  off the buttons — a review session rarely walks further than this. */
export const THUMBNAIL_URL_HISTORY_CAP = 8;

export type ThumbnailUrlHistory = {
  proposalUrl: string | null;
  previousUrls: string[];
  nextUrls: string[];
};

export function coerceThumbnailUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .slice(-THUMBNAIL_URL_HISTORY_CAP);
}

/**
 * Record `incoming` as the current preview.
 *
 * The URL being replaced is pushed onto the previous stack, and the redo
 * stack is cleared — a new preview makes "bring back what I undid" stale.
 * Writing the same URL again (a no-op save) leaves both stacks alone.
 */
export function pushThumbnailUrl(
  history: ThumbnailUrlHistory,
  incoming: string | null,
): ThumbnailUrlHistory {
  const previousUrls = coerceThumbnailUrls(history.previousUrls);
  const nextUrls = coerceThumbnailUrls(history.nextUrls);
  if (incoming === history.proposalUrl) {
    return { proposalUrl: history.proposalUrl, previousUrls, nextUrls };
  }
  if (history.proposalUrl) previousUrls.push(history.proposalUrl);
  return {
    proposalUrl: incoming,
    previousUrls: previousUrls.slice(-THUMBNAIL_URL_HISTORY_CAP),
    nextUrls: [],
  };
}

/**
 * Move one step along the stack.
 *
 * `previous` restores the thumbnail this one replaced and parks the current
 * URL on the redo stack. `redo` does the reverse. Returns null when that
 * direction has nothing to restore.
 */
export function stepThumbnailUrl(
  history: ThumbnailUrlHistory,
  direction: "previous" | "redo",
): ThumbnailUrlHistory | null {
  const previousUrls = coerceThumbnailUrls(history.previousUrls);
  const nextUrls = coerceThumbnailUrls(history.nextUrls);
  if (direction === "previous") {
    const restored = previousUrls.pop();
    if (!restored) return null;
    if (history.proposalUrl) nextUrls.push(history.proposalUrl);
    return {
      proposalUrl: restored,
      previousUrls,
      nextUrls: nextUrls.slice(-THUMBNAIL_URL_HISTORY_CAP),
    };
  }
  const restored = nextUrls.pop();
  if (!restored) return null;
  if (history.proposalUrl) previousUrls.push(history.proposalUrl);
  return {
    proposalUrl: restored,
    previousUrls: previousUrls.slice(-THUMBNAIL_URL_HISTORY_CAP),
    nextUrls,
  };
}

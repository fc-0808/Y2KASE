/**
 * Which slice of the catalogue the thumbnail review queue is working on.
 *
 * Thumbnail generation used to be hard-wired to `status = 'active'`, which made
 * draft products invisible here — you couldn't prepare a listing's thumbnail
 * before publishing it, which is exactly when you want to. The scope is now an
 * explicit, URL-addressable filter (`?scope=`) so the counters, the lists and
 * the batch generator can never disagree about what's in play.
 *
 * This module is deliberately free of DB and Node imports: the review page
 * (server) and its toolbar (client) both need the vocabulary, and the Drizzle
 * predicate that consumes it lives next to the queries in `./thumbnails`.
 */

export const THUMBNAIL_SCOPES = ["all", "active", "draft"] as const;

export type ThumbnailScope = (typeof THUMBNAIL_SCOPES)[number];

/**
 * Drafts are in play by default. Every product in this catalogue is ingested as
 * a draft and published later, so a queue that hid them showed an empty,
 * finished-looking page while a third of the catalogue had no thumbnail at all.
 */
export const DEFAULT_THUMBNAIL_SCOPE: ThumbnailScope = "all";

export const SCOPE_LABELS: Record<ThumbnailScope, string> = {
  all: "All",
  active: "Active",
  draft: "Drafts",
};

/**
 * The `products.status` values each scope covers.
 *
 * `archived` is deliberately absent from every scope — archived listings are
 * retired on purpose and generating for them costs real money for an image
 * nobody will see. Archiving a product therefore also removes it from this
 * queue, which is the behaviour you want.
 */
export const SCOPE_STATUSES: Record<ThumbnailScope, readonly string[]> = {
  all: ["active", "draft"],
  active: ["active"],
  draft: ["draft"],
};

/** Narrow an untrusted `?scope=` value, falling back to the default. */
export function parseThumbnailScope(
  raw: string | string[] | undefined,
): ThumbnailScope {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return THUMBNAIL_SCOPES.includes(value as ThumbnailScope)
    ? (value as ThumbnailScope)
    : DEFAULT_THUMBNAIL_SCOPE;
}

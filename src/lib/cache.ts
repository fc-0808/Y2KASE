import { revalidateTag, unstable_cache } from "next/cache";

/**
 * Stable cache tags for the storefront Data Cache.
 *
 * Storefront read paths (the homepage rails, the mega-menu taxonomy, category
 * image pools, etc.) are wrapped in `unstable_cache` and tagged with these
 * constants so a single admin mutation can invalidate every cached surface that
 * depends on the changed data — instead of waiting out the per-route ISR window.
 *
 * Keep these in sync with the `tags` passed to each `cachedCatalogRead(...)`
 * call.
 */
export const CACHE_TAGS = {
  /** Anything derived from the products table (cards, featured, counts). */
  products: "catalog:products",
  /** The collection taxonomy + per-collection image pools (mega-menu, rails). */
  collections: "catalog:collections",
  /** Published-review summaries that feed listing-card star ratings. */
  reviews: "catalog:reviews",
} as const;

/**
 * `unstable_cache` requires a Next.js incremental cache, which only exists
 * inside a request. Node entry points — the CLI scripts in `scripts/` that
 * generate blog articles, backfill imagery and audit the catalog — have no
 * request, so it throws an "incrementalCache missing" invariant.
 *
 * That failure is dangerous because it is silent: callers that defensively wrap
 * catalog reads in try/catch degrade to an empty result and carry on, which is
 * how a blog article was generated with no catalog data and therefore no
 * product links. Falling back to the uncached function keeps scripts correct;
 * they are one-shot processes, so losing the cache costs nothing.
 */
export function cachedCatalogRead<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  keyParts: string[],
  options: { tags?: string[]; revalidate?: number | false },
): (...args: Args) => Promise<Result> {
  const memoized = unstable_cache(fn, keyParts, options);
  return async (...args: Args): Promise<Result> => {
    try {
      return await memoized(...args);
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes("incrementalCache missing")
      ) {
        return fn(...args);
      }
      throw err;
    }
  };
}

/**
 * Invalidate every storefront catalog cache after a catalog mutation. Call this
 * alongside the existing `revalidatePath(...)` calls in admin server actions so
 * edits to products, collection membership, media or reviews surface
 * immediately across the menu, homepage and listing pages.
 */
export function revalidateStorefrontCatalog(): void {
  // `"max"` = stale-while-revalidate: shoppers keep getting an instant cached
  // response while the entry refreshes in the background after the next visit.
  // (Admin-facing routes are still expired immediately via `revalidatePath`.)
  revalidateTag(CACHE_TAGS.products, "max");
  revalidateTag(CACHE_TAGS.collections, "max");
  revalidateTag(CACHE_TAGS.reviews, "max");
}

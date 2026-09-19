import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";

/**
 * Storefront cache policy.
 *
 * Vercel Hobby meters two different resources this file is designed to keep
 * under the included allowance:
 *
 *  - **ISR Writes** are 8 KB units of *changed* output stored in durable ISR /
 *    Data Cache. Unchanged regenerations are free. Unique URLs, short timers,
 *    `new Date()` in cached HTML, and `revalidatePath('/products/[slug]')` of
 *    every PDP are what run the meter up.
 *  - **Fluid Active CPU** is milliseconds of actual JS execution. Waiting on
 *    Neon does not count; rendering and serializing large RSC trees does.
 *
 * Catalog data is event-driven (admin saves, review publish). Time-based ISR
 * is only a safety net on canonical pages. Faceted listing URLs must not
 * create durable ISR entries — each `?color=&motif=&page=` combo is a new
 * cache key, and crawlers will fill the 200K write budget.
 *
 * @see https://vercel.com/docs/incremental-static-regeneration/limits-and-pricing
 * @see https://vercel.com/kb/guide/how-to-move-to-on-demand-revalidation
 */

/**
 * Canonical storefront pages (home, PDP, blog, collection index, OG images).
 * One day is the safety net; admin mutations invalidate on demand.
 *
 * Next.js segment config cannot follow imports (`extractExportedConstValue`
 * only accepts numeric literals). Pages must write `export const revalidate
 * = 86400` — keep that literal in lockstep with this constant.
 */
export const STOREFRONT_REVALIDATE = 86_400;

/**
 * Data Cache for tagged catalog reads. `false` = keep until `revalidateTag`.
 * A 5-minute timer here rewrote every unique filter combo even when nothing
 * in Neon changed.
 */
export const DATA_CACHE_REVALIDATE = false;

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
  options: { tags?: string[]; revalidate?: number | false } = {},
): (...args: Args) => Promise<Result> {
  const memoized = unstable_cache(fn, keyParts, {
    tags: options.tags,
    revalidate: options.revalidate ?? DATA_CACHE_REVALIDATE,
  });
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
 * Invalidate tagged Data Cache after a catalog mutation.
 *
 * `"max"` = stale-while-revalidate: shoppers keep getting an instant cached
 * response while the entry refreshes in the background after the next visit.
 * (Admin-facing routes are still expired immediately via `revalidatePath`.)
 */
export function revalidateStorefrontCatalog(): void {
  revalidateTag(CACHE_TAGS.products, "max");
  revalidateTag(CACHE_TAGS.collections, "max");
  revalidateTag(CACHE_TAGS.reviews, "max");
}

/**
 * Canonical listing HTML (home, /products, /collections, insights).
 *
 * Do not call `revalidatePath("/products/[slug]", "page")` from here. That
 * marks every PDP stale; the next crawl of 161 product URLs rewrites ISR
 * units for pages whose data did not change.
 */
export function revalidateStorefrontListings(): void {
  revalidatePath("/");
  revalidatePath("/products");
  revalidatePath("/collections");
  revalidatePath("/insights");
}

/**
 * One product changed. Refresh that PDP and the shared listing caches.
 * Passing a slug avoids a DB round-trip; callers that only have an id should
 * resolve it first.
 */
export function revalidateStorefrontProduct(slug: string): void {
  const trimmed = slug.trim();
  if (trimmed) revalidatePath(`/products/${trimmed}`);
  revalidateStorefrontListings();
  revalidateStorefrontCatalog();
}

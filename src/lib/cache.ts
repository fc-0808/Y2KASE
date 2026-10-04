import { revalidateTag, unstable_cache } from "next/cache";

/**
 * Storefront cache policy.
 *
 * Vercel Hobby meters two different resources this file is designed to keep
 * under the included allowance:
 *
 *  - **ISR Writes** are 8 KB units of *changed* output stored in durable ISR /
 *    Data Cache. A shared `catalog:products` tag on every PDP meant one edit
 *    rewrote every product entry on the next crawl. Per-product tags avoid
 *    that. HTML stays force-dynamic and is held at the CDN (`cache-headers.ts`).
 *  - **Fluid Active CPU** is milliseconds of actual JS execution. Waiting on
 *    Neon does not count; rendering and serializing large RSC trees does.
 *    Short CDN lifetimes (listings every 2 minutes, PDPs every hour) made
 *    crawlers re-execute those trees all month.
 *
 * @see https://vercel.com/docs/incremental-static-regeneration/limits-and-pricing
 * @see https://vercel.com/docs/caching/cdn-cache
 */

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
  /**
   * Shared listing reads only (shop grid, rails, facet counts, featured).
   * Do not put a per-product payload on this tag. One edit used to mark every
   * PDP's Data Cache entry stale, and the next crawl rewrote each of them —
   * that is what filled Hobby's ISR write units.
   */
  products: "catalog:products",
  /** The collection taxonomy + per-collection image pools (mega-menu, rails). */
  collections: "catalog:collections",
  /** Published-review summaries that feed listing-card star ratings. */
  reviews: "catalog:reviews",
} as const;

/** One Data Cache entry. Invalidating it does not touch the other products. */
export function productCacheTag(slug: string): string {
  return `catalog:product:${slug}`;
}

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
function errorChain(err: unknown): Error[] {
  const out: Error[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    out.push(current);
    current = current.cause;
  }
  return out;
}

function isDurableCacheUnavailable(err: unknown): boolean {
  return errorChain(err).some((error) => {
    const message = error.message.toLowerCase();
    return (
      message.includes("incrementalcache missing") ||
      message.includes("failed to update prerender cache") ||
      message.includes("failed to set next.js data cache") ||
      message.includes("isr write") ||
      (message.includes("exceeded") && message.includes("isr")) ||
      (message.includes("quota") && message.includes("cache"))
    );
  });
}

let warnedDurableCacheMiss = false;

/**
 * Local dev has no CDN, and it uses the production database. Without this,
 * every click in `next dev` resets Neon's 5-minute suspend timer.
 * Eight minutes is longer than that timer, so a burst of local navigations
 * is one wake-up and then the compute can sleep.
 */
const DEV_CATALOG_TTL_MS = 8 * 60 * 1000;
const DEV_CATALOG_CACHE_MAX = 200;

type DevCatalogEntry = { expires: number; value: unknown };
const devCatalogCache = new Map<string, DevCatalogEntry>();

function rememberDevCatalogRead(key: string, value: unknown): void {
  if (devCatalogCache.size >= DEV_CATALOG_CACHE_MAX) {
    const oldest = devCatalogCache.keys().next().value;
    if (oldest !== undefined) devCatalogCache.delete(oldest);
  }
  devCatalogCache.set(key, { expires: Date.now() + DEV_CATALOG_TTL_MS, value });
}

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
    if (process.env.NODE_ENV === "development") {
      const key = `${keyParts.join("\0")}\0${JSON.stringify(args)}`;
      const cached = devCatalogCache.get(key);
      if (cached && cached.expires > Date.now()) return cached.value as Result;
      const value = await fn(...args);
      rememberDevCatalogRead(key, value);
      return value;
    }
    try {
      return await memoized(...args);
    } catch (err) {
      // Scripts have no incremental cache. Production can also fail to persist
      // Data Cache entries once Hobby ISR writes are exhausted. Shoppers still
      // get a live Neon read instead of a 500.
      if (isDurableCacheUnavailable(err)) {
        if (!warnedDurableCacheMiss) {
          warnedDurableCacheMiss = true;
          console.warn(
            "[catalog-cache] durable cache unavailable; serving live catalog reads",
            err,
          );
        }
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
  devCatalogCache.clear();
  try {
    revalidateTag(CACHE_TAGS.products, "max");
    revalidateTag(CACHE_TAGS.collections, "max");
    revalidateTag(CACHE_TAGS.reviews, "max");
  } catch (err) {
    console.warn("[catalog-cache] tag revalidation skipped", err);
  }
}

/**
 * Canonical listing HTML (home, /products, /collections, insights).
 *
 * Do not call `revalidatePath("/products/[slug]", "page")` from here. That
 * marks every PDP stale; the next crawl of 161 product URLs rewrites ISR
 * units for pages whose data did not change.
 *
 * Storefront HTML is force-dynamic + CDN while Hobby ISR writes are
 * exhausted. `revalidatePath` on those routes would mark durable ISR stale,
 * then fail to persist the replacement and 500 the next visitor. Tag
 * invalidation still refreshes Data Cache for faceted listings.
 */
export function revalidateStorefrontListings(): void {
  revalidateStorefrontCatalog();
}

/**
 * One product changed. Refresh shared listing Data Cache tags.
 * The slug is accepted for call-site compatibility; path ISR is not used
 * while Hobby write quota is exhausted.
 */
export function revalidateStorefrontProduct(slug: string): void {
  // Path ISR is intentionally not keyed by slug while Hobby write quota is exhausted.
  // Only this product's Data Cache entry is marked stale. Listing tags stay
  // with {@link revalidateStorefrontListings} so a single save cannot force
  // a rewrite of every other PDP the next time a crawler walks the sitemap.
  try {
    revalidateTag(productCacheTag(slug), "max");
  } catch (err) {
    console.warn("[catalog-cache] product tag revalidation skipped", err);
  }
}

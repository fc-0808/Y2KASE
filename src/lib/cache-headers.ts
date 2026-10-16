/**
 * CDN cache policy for storefront HTML and images.
 *
 * Kept free of `next/cache` so `next.config.ts` can import it during config
 * evaluation. The values are the ephemeral Vercel CDN layer (free). They are
 * not durable ISR writes.
 *
 * Hobby ISR Writes are exhausted for this billing cycle. Canonical pages that
 * used to `export const revalidate = 86400` now render dynamically and rely
 * on these headers so new visitors still get a response when durable ISR
 * cannot persist, and repeat visitors hit CDN instead of Fluid CPU.
 */

/**
 * One day. An hourly window re-ran the catalog function for every bot hit
 * on `/products` and each collection URL. That origin work is Fluid Active
 * CPU, and Hobby's included 4 hours is already spent. Filter changes show
 * up within a day; the CDN keeps serving the previous HTML while a refresh
 * happens, so a new visitor never waits on a function for a warm URL.
 */
export const FACETED_CDN_MAX_AGE_SECONDS = 86_400;
export const FACETED_CDN_STALE_WHILE_REVALIDATE_SECONDS = 604_800;

export const FACETED_CDN_CACHE_CONTROL = `public, s-maxage=${FACETED_CDN_MAX_AGE_SECONDS}, stale-while-revalidate=${FACETED_CDN_STALE_WHILE_REVALIDATE_SECONDS}`;

/**
 * Home, PDP, blog, collections index, insights. One origin render per week
 * per path. A daily crawl of the sitemap (about 400 URLs) was enough to
 * spend the Hobby Fluid Active CPU allowance, and once that allowance is
 * gone Vercel can stop functions — including checkout. The CDN keeps
 * serving the previous HTML for 30 days, so a new visitor still gets the
 * page without a function.
 */
export const CANONICAL_CDN_MAX_AGE_SECONDS = 604_800;
export const CANONICAL_CDN_STALE_WHILE_REVALIDATE_SECONDS = 2_592_000;

export const CANONICAL_CDN_CACHE_CONTROL = `public, s-maxage=${CANONICAL_CDN_MAX_AGE_SECONDS}, stale-while-revalidate=${CANONICAL_CDN_STALE_WHILE_REVALIDATE_SECONDS}`;

/** Open Graph PNGs are expensive to render; cache a day, serve stale for a week. */
export const OG_CDN_MAX_AGE_SECONDS = 86_400;

export const OG_CDN_CACHE_CONTROL = `public, s-maxage=${OG_CDN_MAX_AGE_SECONDS}, stale-while-revalidate=${CANONICAL_CDN_STALE_WHILE_REVALIDATE_SECONDS}`;

/** Merchant / Pinterest feeds and the sitemap. One origin build per day. */
export const FEED_CDN_MAX_AGE_SECONDS = 86_400;

export const FEED_CDN_CACHE_CONTROL = `public, s-maxage=${FEED_CDN_MAX_AGE_SECONDS}, stale-while-revalidate=${FACETED_CDN_STALE_WHILE_REVALIDATE_SECONDS}`;

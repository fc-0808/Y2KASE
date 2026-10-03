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
 * One hour. A 2-minute window re-ran the catalog function for every bot hit
 * on `/products` and each collection URL — that origin work is Fluid Active
 * CPU, and Hobby's included 4 hours was down to 10 minutes. Filter changes
 * still show up within the hour; the CDN keeps serving the previous HTML
 * while that refresh happens.
 */
export const FACETED_CDN_MAX_AGE_SECONDS = 3_600;
export const FACETED_CDN_STALE_WHILE_REVALIDATE_SECONDS = 86_400;

export const FACETED_CDN_CACHE_CONTROL = `public, s-maxage=${FACETED_CDN_MAX_AGE_SECONDS}, stale-while-revalidate=${FACETED_CDN_STALE_WHILE_REVALIDATE_SECONDS}`;

/**
 * Home, PDP, blog, collections index, insights. One origin render per day
 * per path. An hourly crawl of a few hundred product URLs was enough to
 * spend most of the Hobby Fluid CPU allowance. CDN keeps serving stale for
 * a week so a crawler wave cannot reopen that bill.
 */
export const CANONICAL_CDN_MAX_AGE_SECONDS = 86_400;
export const CANONICAL_CDN_STALE_WHILE_REVALIDATE_SECONDS = 604_800;

export const CANONICAL_CDN_CACHE_CONTROL = `public, s-maxage=${CANONICAL_CDN_MAX_AGE_SECONDS}, stale-while-revalidate=${CANONICAL_CDN_STALE_WHILE_REVALIDATE_SECONDS}`;

/** Open Graph PNGs are expensive to render; cache a day, serve stale for a week. */
export const OG_CDN_MAX_AGE_SECONDS = 86_400;

export const OG_CDN_CACHE_CONTROL = `public, s-maxage=${OG_CDN_MAX_AGE_SECONDS}, stale-while-revalidate=${CANONICAL_CDN_STALE_WHILE_REVALIDATE_SECONDS}`;

/** Merchant / Pinterest feeds and the sitemap. One origin build per day. */
export const FEED_CDN_MAX_AGE_SECONDS = 86_400;

export const FEED_CDN_CACHE_CONTROL = `public, s-maxage=${FEED_CDN_MAX_AGE_SECONDS}, stale-while-revalidate=${FACETED_CDN_STALE_WHILE_REVALIDATE_SECONDS}`;

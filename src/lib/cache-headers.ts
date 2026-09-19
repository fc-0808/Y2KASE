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
 * 120s is long enough that a shopper refining filters in one session still
 * hits CDN on back/forward, and short enough that an admin merchandising
 * change is visible on listings within two minutes even if tag invalidation
 * does not purge this layer.
 */
export const FACETED_CDN_MAX_AGE_SECONDS = 120;
export const FACETED_CDN_STALE_WHILE_REVALIDATE_SECONDS = 86_400;

export const FACETED_CDN_CACHE_CONTROL = `public, s-maxage=${FACETED_CDN_MAX_AGE_SECONDS}, stale-while-revalidate=${FACETED_CDN_STALE_WHILE_REVALIDATE_SECONDS}`;

/**
 * Home, PDP, blog, collections index, insights. One origin render per hour
 * per path; CDN keeps serving stale for a week so a crawler wave cannot
 * reopen ISR writes or burn the remaining Fluid CPU.
 */
export const CANONICAL_CDN_MAX_AGE_SECONDS = 3_600;
export const CANONICAL_CDN_STALE_WHILE_REVALIDATE_SECONDS = 604_800;

export const CANONICAL_CDN_CACHE_CONTROL = `public, s-maxage=${CANONICAL_CDN_MAX_AGE_SECONDS}, stale-while-revalidate=${CANONICAL_CDN_STALE_WHILE_REVALIDATE_SECONDS}`;

/** Open Graph PNGs are expensive to render; cache a day, serve stale for a week. */
export const OG_CDN_MAX_AGE_SECONDS = 86_400;

export const OG_CDN_CACHE_CONTROL = `public, s-maxage=${OG_CDN_MAX_AGE_SECONDS}, stale-while-revalidate=${CANONICAL_CDN_STALE_WHILE_REVALIDATE_SECONDS}`;

/** Merchant / Pinterest feeds: origin only on CDN miss. Builds must not bake an empty catalog. */
export const FEED_CDN_MAX_AGE_SECONDS = 3_600;

export const FEED_CDN_CACHE_CONTROL = `public, s-maxage=${FEED_CDN_MAX_AGE_SECONDS}, stale-while-revalidate=${FACETED_CDN_STALE_WHILE_REVALIDATE_SECONDS}`;

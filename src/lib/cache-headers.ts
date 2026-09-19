/**
 * CDN cache policy for faceted catalog URLs.
 *
 * Kept free of `next/cache` so `next.config.ts` can import it during config
 * evaluation. The values are the ephemeral Vercel CDN layer (free). They are
 * not durable ISR writes.
 *
 * 120s is long enough that a shopper refining filters in one session still
 * hits CDN on back/forward, and short enough that an admin merchandising
 * change is visible on listings within two minutes even if tag invalidation
 * does not purge this layer.
 */
export const FACETED_CDN_MAX_AGE_SECONDS = 120;
export const FACETED_CDN_STALE_WHILE_REVALIDATE_SECONDS = 86_400;

export const FACETED_CDN_CACHE_CONTROL = `public, s-maxage=${FACETED_CDN_MAX_AGE_SECONDS}, stale-while-revalidate=${FACETED_CDN_STALE_WHILE_REVALIDATE_SECONDS}`;

/** Merchant / Pinterest feeds: origin only on CDN miss. Builds must not bake an empty catalog. */
export const FEED_CDN_MAX_AGE_SECONDS = 3_600;

export const FEED_CDN_CACHE_CONTROL = `public, s-maxage=${FEED_CDN_MAX_AGE_SECONDS}, stale-while-revalidate=${FACETED_CDN_STALE_WHILE_REVALIDATE_SECONDS}`;

/**
 * Public site identity and canonical-origin handling.
 *
 * This module is deliberately dependency-free and safe in every runtime
 * (Node, Edge and the browser bundle). SEO metadata, feeds, redirects and
 * transactional links must all resolve to the same origin; duplicating the
 * fallback across those surfaces is how preview/localhost URLs leak into
 * production indexes.
 */

export const SITE_NAME = "Y2KASE";
export const PRODUCTION_SITE_URL = "https://y2kase.com";

function normalizeSiteUrl(raw: string): string {
  const value = raw.trim();

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`Unsupported protocol "${url.protocol}"`);
    }

    // A canonical origin cannot contain credentials, query strings or hashes.
    // Paths are stripped as well: NEXT_PUBLIC_SITE_URL describes the origin,
    // never a deployment subdirectory.
    if (url.username || url.password || url.search || url.hash) {
      throw new Error("Credentials, query strings and hashes are not allowed");
    }

    return url.origin;
  } catch (error) {
    throw new Error(
      `Invalid NEXT_PUBLIC_SITE_URL "${raw}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

const fallbackUrl =
  process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : PRODUCTION_SITE_URL;

export const SITE_URL = normalizeSiteUrl(
  process.env.NEXT_PUBLIC_SITE_URL || fallbackUrl,
);

/** Turn an app-relative path into an absolute URL on the canonical origin. */
export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(path.startsWith("/") ? path : `/${path}`, `${SITE_URL}/`).href;
}

/**
 * Preview deployments must never compete with production in search results.
 * On non-Vercel hosts, a production build is indexable only when it explicitly
 * points at the production canonical origin.
 */
export function shouldIndexSite(args: {
  vercelEnv?: string;
  nodeEnv?: string;
  siteUrl: string;
}): boolean {
  const productionRuntime = args.vercelEnv
    ? args.vercelEnv === "production"
    : args.nodeEnv === "production";
  return productionRuntime && args.siteUrl === PRODUCTION_SITE_URL;
}

export const IS_INDEXABLE_DEPLOYMENT = shouldIndexSite({
  vercelEnv: process.env.VERCEL_ENV,
  nodeEnv: process.env.NODE_ENV,
  siteUrl: SITE_URL,
});

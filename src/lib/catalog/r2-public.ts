/**
 * Public R2 hostname helpers. Safe in client and server bundles (no S3 SDK).
 *
 * Catalog rows historically stored the `*.r2.dev` development URL. Production
 * now serves the same objects from `media.y2kase.com`. Key recovery and
 * storefront rendering must treat both hosts as the same bucket.
 */

/** Cloudflare's rate-limited development host for this bucket. */
export const LEGACY_R2_PUBLIC_HOST =
  "pub-ed7f8ed365ab49089eec8a6a7398124f.r2.dev";

/** Custom domain attached to the `y2kase-media` bucket. */
export const PRODUCTION_R2_PUBLIC_HOST = "media.y2kase.com";

export const LEGACY_R2_PUBLIC_ORIGIN = `https://${LEGACY_R2_PUBLIC_HOST}`;
export const PRODUCTION_R2_PUBLIC_ORIGIN = `https://${PRODUCTION_R2_PUBLIC_HOST}`;

export function r2PublicHosts(extraOrigin?: string | null): Set<string> {
  const hosts = new Set([LEGACY_R2_PUBLIC_HOST, PRODUCTION_R2_PUBLIC_HOST]);
  if (extraOrigin) {
    try {
      hosts.add(new URL(extraOrigin).hostname);
    } catch {
      // Ignore a malformed override; callers that require the env already throw.
    }
  }
  return hosts;
}

/**
 * Recover the object key from a public URL we issued. Null for foreign CDNs
 * (Etsy, Cloudinary) so deletes never touch objects we do not own.
 */
export function r2KeyFromPublicUrl(
  url: string,
  extraOrigin?: string | null,
): string | null {
  try {
    const parsed = new URL(url.trim());
    if (!r2PublicHosts(extraOrigin).has(parsed.hostname)) return null;
    const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    return key || null;
  } catch {
    return null;
  }
}

/** Point a known R2 public URL at the production custom domain. */
export function canonicalizePublicR2Url(url: string): string {
  const key = r2KeyFromPublicUrl(url);
  if (!key) return url;
  return `${PRODUCTION_R2_PUBLIC_ORIGIN}/${key}`;
}

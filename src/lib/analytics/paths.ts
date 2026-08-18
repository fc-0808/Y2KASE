/**
 * Which paths belong in storefront traffic reporting.
 *
 * The client beacon and the server endpoint both need this answer, and they
 * need the same one: a path the browser reports but the server refuses is a
 * wasted request on every page view, and a path the server accepts but the
 * browser never sends is a reporting gap nobody notices. One predicate, two
 * callers, no drift.
 *
 * Kept free of anything but the route constants: `VisitorTracker` is mounted in
 * the root layout, so whatever this module reaches is on every shopper's
 * critical path.
 */

import { PREVIEW_ROUTE_PREFIX } from "@/lib/preview/routes";

/**
 * Namespaces that are not shopper surfaces: the console, the API, and the
 * internal QA routes that exist to set up a visit rather than be one.
 *
 * Matched as whole segments, so `/administrator` and `/apixel` stay countable —
 * a bare `startsWith("/admin")` would silently drop them.
 */
const UNTRACKED_SEGMENTS = ["/admin", "/api", PREVIEW_ROUTE_PREFIX] as const;

/** Should a page view at this path be recorded in first-party analytics? */
export function isTrackablePath(pathname: string): boolean {
  if (!pathname.startsWith("/")) return false;
  return !UNTRACKED_SEGMENTS.some(
    (segment) => pathname === segment || pathname.startsWith(`${segment}/`),
  );
}

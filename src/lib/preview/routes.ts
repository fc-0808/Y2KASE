/**
 * The fresh-visit URL contract — nothing but strings.
 *
 * Split out from `visitor-state` on a bundle-size argument rather than a
 * stylistic one. `isTrackablePath` needs the `/preview` prefix, and it runs in
 * `VisitorTracker`, which is mounted in the root layout — so anything reachable
 * from these constants is downloaded by every shopper on every page. The reset
 * inventory is operator-facing prose that has no business on the critical path.
 *
 * Keep this module free of everything except the constants below.
 */

/**
 * Namespace for internal QA surfaces.
 *
 * Excluded from first-party analytics, from robots, and from the paths a fresh
 * visit may land on — a rehearsal that starts on the rehearsal machinery is not
 * a rehearsal of anything.
 */
export const PREVIEW_ROUTE_PREFIX = "/preview";

/** Signed entry point. Expires server cookies, then hands off to the bootstrap. */
export const FRESH_VISIT_ENTRY_PATH = "/api/preview/fresh-visit";

/** Interstitial that clears browser storage before forwarding to the storefront. */
export const FRESH_VISIT_BOOTSTRAP_PATH = `${PREVIEW_ROUTE_PREFIX}/fresh-visit`;

/** Query parameter carrying the signed ticket on both hops. */
export const FRESH_VISIT_TOKEN_PARAM = "t";

/** Query parameter carrying a failure reason when there is no usable ticket. */
export const FRESH_VISIT_STATUS_PARAM = "status";

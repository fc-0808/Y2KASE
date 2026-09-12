/**
 * Wire contract shared by the storefront beacon and `/api/track`.
 *
 * Keep this module dependency-free: `VisitorTracker` imports it from the root
 * layout, so every shopper downloads anything reachable from here.
 */

/** Marks requests emitted by our current first-party tracker. */
export const ANALYTICS_MARKER_HEADER = "x-y2k-analytics";
export const ANALYTICS_MARKER_VALUE = "v1";

/** Server-owned anonymous identity and its HMAC proof. */
export const ANALYTICS_VISITOR_COOKIE = "y2k_vid";
export const ANALYTICS_VISITOR_PROOF_COOKIE = "y2k_vproof";

/**
 * A response carrying this header has planted the HttpOnly visitor cookie but
 * deliberately did not count a view. The client retries once so only browsers
 * that accept and return first-party cookies enter visitor reporting.
 */
export const ANALYTICS_VISITOR_SEEDED_HEADER = "x-y2k-visitor-seeded";
export const ANALYTICS_VISITOR_SEEDED_VALUE = "1";

/** The beacon contains two short strings and two small browser signals. */
export const MAX_ANALYTICS_REQUEST_BYTES = 2_048;

export type AnalyticsBeaconPayload = {
  path: string;
  referrer: string | null;
  /** Positive-only signal: `true` is sufficient to exclude browser automation. */
  webdriver: boolean;
  /** User-Agent Client Hints platform, falling back to `navigator.platform`. */
  platform: string | null;
};

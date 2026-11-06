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

/** The beacon contains the path, referrer, landing query, and two small browser signals. */
export const MAX_ANALYTICS_REQUEST_BYTES = 2_048;

/**
 * Chrome already sends Sec-CH-UA, Sec-CH-UA-Mobile, and Sec-CH-UA-Platform.
 * The other names are high-entropy and arrive only on requests after this
 * response header. Tokens must match the header names exactly.
 * https://developer.chrome.com/docs/privacy-security/user-agent-client-hints
 */
export const ACCEPT_CLIENT_HINTS = [
  "Sec-CH-UA",
  "Sec-CH-UA-Mobile",
  "Sec-CH-UA-Platform",
  "Sec-CH-UA-Platform-Version",
  "Sec-CH-UA-Arch",
  "Sec-CH-UA-Model",
  "Sec-CH-UA-Bitness",
  "Sec-CH-UA-Full-Version-List",
].join(", ");

export type AnalyticsBeaconPayload = {
  path: string;
  referrer: string | null;
  /**
   * `location.search` of the page being viewed, capped by the client.
   * Older beacons omit it.
   */
  search?: string | null;
  /** Positive-only signal: `true` is sufficient to exclude browser automation. */
  webdriver: boolean;
  /** User-Agent Client Hints platform, falling back to `navigator.platform`. */
  platform: string | null;
  /**
   * Fetch metadata from the page request, copied by the server into the
   * tracker. The beacon's own fetch metadata only describes `/api/track`.
   */
  secFetchSite?: string | null;
  secFetchMode?: string | null;
  secFetchDest?: string | null;
  secFetchUser?: string | null;
};

const FETCH_SITES = new Set(["none", "same-origin", "same-site", "cross-site"]);
const FETCH_MODES = new Set([
  "navigate",
  "cors",
  "no-cors",
  "same-origin",
  "websocket",
]);
const FETCH_DESTS = new Set([
  "document",
  "empty",
  "image",
  "script",
  "style",
  "font",
  "iframe",
]);

function allowToken(
  value: unknown,
  allowed: Set<string>,
  max: number,
): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().toLowerCase();
  if (!clean || clean.length > max || !allowed.has(clean)) return null;
  return clean;
}

export function allowDocumentFetchSite(value: unknown): string | null {
  return allowToken(value, FETCH_SITES, 16);
}

export function allowDocumentFetchMode(value: unknown): string | null {
  return allowToken(value, FETCH_MODES, 16);
}

export function allowDocumentFetchDest(value: unknown): string | null {
  return allowToken(value, FETCH_DESTS, 16);
}

export function allowDocumentFetchUser(value: unknown): string | null {
  return value === "?1" ? "?1" : null;
}

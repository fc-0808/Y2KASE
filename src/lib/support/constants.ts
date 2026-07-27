/**
 * Support — shared contract between the help widget, the policy pages and the
 * identity endpoint. Deliberately dependency-free: the widget is a lazy-loaded
 * facade whose whole value is being small, so anything it imports has to be
 * cheap. (This is why SUPPORT_EMAIL lives here rather than in `@/lib/legal`,
 * which carries every policy document as inline HTML.)
 */

/** Where every customer conversation ultimately lands. */
export const SUPPORT_EMAIL = "hello@y2kase.com";

/**
 * The response time we promise. The FAQ quotes the same 24 hours in prose —
 * if this number ever moves, move it there too.
 */
export const SUPPORT_RESPONSE_TIME = "Typically replies within 24 hours";

/**
 * Cross-app trigger for the help widget. Any part of the storefront (a CTA on
 * /contact, a nudge after checkout, a link in the FAQ) can raise the panel by
 * calling `openSupportPanel()`. Mirrors the CONSENT_OPEN_EVENT pattern the
 * cookie banner already uses, so a page never has to import the widget, share
 * a React context, or thread props through the layout to reach it.
 */
export const SUPPORT_OPEN_EVENT = "y2k:open-support";

/** Open the help panel from anywhere in the storefront. No-ops on the server. */
export function openSupportPanel(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SUPPORT_OPEN_EVENT));
}

/**
 * Response shape of GET /api/support/identity. Declared here (rather than in
 * the route) so the client can import the contract without pulling a server
 * module — and so a change to one side fails typecheck on the other.
 */
export type SupportIdentity = {
  identified: boolean;
  name?: string;
  email?: string;
  /** HMAC of the email; present only when the vendor's secure mode is set up. */
  hash?: string;
  /**
   * Agent-dashboard metadata. tawk restricts keys to alphanumerics and dashes
   * and drops the whole payload on an invalid key, so keep them kebab-case.
   */
  attributes?: Record<string, string>;
};

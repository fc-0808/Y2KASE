/**
 * Routing — the single source of truth for canonical URLs, the permanent
 * redirects that keep old URLs alive, and which global chrome a page receives.
 *
 * ⚠️ This module MUST stay dependency-free (no React, no hooks, no `@/`
 * imports, no side effects). `next.config.ts` `require()`s it while Next.js is
 * still loading its own configuration, long before the app graph or the `@/`
 * path alias exist. Anything imported here is imported by the build itself.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Canonical paths
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Paths that are referenced from more than one surface.
 *
 * A URL that is hand-typed into a hero CTA, a support answer, a sitemap entry
 * AND a `canonical` tag has four chances to drift out of sync with the folder
 * that actually serves it — which is exactly how `/welcome-gift` ended up
 * 404-ing while the page sat at `/pages/welcome-gift`. Import the constant so a
 * move is one edit plus a redirect, not a scavenger hunt.
 *
 * Add a path here once a second surface links to it; one-off links can stay
 * inline.
 */
export const ROUTES = {
  /** The welcome-offer landing page (email capture → discount code). */
  welcomeGift: "/welcome-gift",
  /** Live first-party catalog snapshot (original data, not a blog post). */
  insights: "/insights",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Redirects
// ─────────────────────────────────────────────────────────────────────────────

export type RouteRedirect = {
  /** Incoming path, matched before the filesystem. */
  source: string;
  /** Where to send it. Must not itself be a `source` (see the check below). */
  destination: string;
  /**
   * `true` → 308, cached by browsers indefinitely and consolidates search
   * ranking onto the destination. Correct for a URL that genuinely moved.
   *
   * `false` → 307. Correct for convenience aliases we invented, which carry no
   * accumulated ranking and which we may want to repurpose later — a 308 would
   * be pinned in visitors' browser caches with no way to take it back.
   */
  permanent: boolean;
};

/**
 * Every path the storefront answers for that isn't a real route.
 *
 * Next.js checks these before the filesystem, so a hit never reaches a page.
 * Deleting a row breaks whatever still links to it out in the world, so rows
 * retire only when the logs go quiet.
 */
export const REDIRECTS: readonly RouteRedirect[] = [
  // The landing page shipped under a Shopify-style "/pages/" prefix, which
  // means nothing in the App Router and reads like leftover Pages Router code.
  // It was the advertised canonical, so the old URL keeps its ranking forever.
  {
    source: "/pages/welcome-gift",
    destination: ROUTES.welcomeGift,
    permanent: true,
  },

  // Aliases for what people actually type. "/welcome-page" is not a guess —
  // it showed up in the dev server logs as a 404 from someone looking for this
  // page, and "/welcome" is the short form worth having on print and socials.
  { source: "/welcome", destination: ROUTES.welcomeGift, permanent: false },
  { source: "/welcome-page", destination: ROUTES.welcomeGift, permanent: false },

  // Former standalone Club calendar. Cadence now lives as a tab inside Email
  // (`/admin/campaigns?view=cadence`). 307 so a browser never caches the alias
  // if the studio URL moves again. Query string is a literal — this file cannot
  // import `@/lib/marketing/types`.
  {
    source: "/admin/cadence",
    destination: "/admin/campaigns?view=cadence",
    permanent: false,
  },

  // Stale Google-indexed URL for a product that was renamed.
  {
    source: "/products/coquette-y2k-floral-magsafe-case-for-iphone-17-w-grip",
    destination: "/products",
    permanent: true,
  },
];

/**
 * Reject a redirect table that would strand visitors, throwing with the
 * offending row. Called from `next.config.ts`, so a bad row fails the build
 * instead of shipping.
 *
 * Three ways this table can go wrong, none of which Next.js catches:
 *  - A row pointing at itself is an infinite redirect — the page becomes
 *    permanently unreachable, and at 308 the browser caches that forever.
 *  - Two rows for one `source`: the second is dead code, and which one wins is
 *    not something a reader should have to know.
 *  - A `destination` that is another row's `source` costs every visitor an
 *    extra round trip and dilutes the ranking Google passes along the chain.
 *    Point the row at the final destination instead.
 */
export function assertRedirectsAreResolvable(
  table: readonly RouteRedirect[],
): void {
  const sources = new Set<string>();

  for (const row of table) {
    if (row.source === row.destination) {
      throw new Error(
        `Redirect loop: "${row.source}" redirects to itself.`,
      );
    }
    if (sources.has(row.source)) {
      throw new Error(
        `Duplicate redirect source: "${row.source}" is listed more than once.`,
      );
    }
    sources.add(row.source);
  }

  for (const row of table) {
    if (sources.has(row.destination)) {
      throw new Error(
        `Redirect chain: "${row.source}" points at "${row.destination}", ` +
          `which is itself redirected. Point it at the final destination.`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route classification
// ─────────────────────────────────────────────────────────────────────────────
//
// Kept as a pure predicate so admin-aware callers share one precise boundary.

/** The /admin console, which ships its own shell (`AdminNavbar`). */
export function isAdminRoute(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * Visitor state — everything a browser remembers about a shopper, and the only
 * module that knows how to make it forget.
 *
 * WHY THIS EXISTS
 * "Brand new visitor" is not a page, it is an *absence*: no pop-up counters, no
 * saved bag, no promo code, no visitor id, no attribution. That absence is
 * spread across two Web Storage areas and a handful of cookies written by five
 * unrelated features, which makes "show me the first-visit experience" the one
 * thing the storefront's own author cannot reliably do. Clearing site data by
 * hand misses a key; a private window is a different browser profile with
 * different fonts, extensions and network conditions.
 *
 * So the reset is code, and it lives here.
 *
 * WHY THE SWEEP IS PREFIX-BASED, NOT A KEY LIST
 * A hand-maintained list of keys is a list that goes stale the first time
 * someone ships a feature and forgets to update it — and the failure is silent:
 * the "fresh" visit quietly carries one piece of old state, and whoever is
 * testing draws the wrong conclusion. Every storefront key already lives under
 * the `y2k_` / `y2kase-` namespaces, so sweeping the namespace covers keys that
 * do not exist yet. Adding a feature costs nothing; forgetting costs nothing.
 *
 * ISOMORPHIC: imported by a client component (the wipe) and by server code
 * (the cookie names, the path guard). Keep it free of `node:` imports, React
 * and any database access. The URL constants live in `./routes` so the
 * root-layout beacon can read them without pulling this module's prose along.
 */

import { PREVIEW_ROUTE_PREFIX } from "@/lib/preview/routes";

// ─────────────────────────────────────────────────────────────────────────────
// Storage namespaces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every namespace the storefront writes into `localStorage`, `sessionStorage`
 * and JavaScript-readable cookies. `y2k_` covers the feature keys; `y2kase-`
 * covers the two Zustand persisted stores (cart and promo).
 */
export const STOREFRONT_STORAGE_PREFIXES = ["y2k_", "y2kase-"] as const;

/** Is this a key the storefront owns, and may therefore reset? */
export function isStorefrontStateKey(key: string): boolean {
  return STOREFRONT_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

// ─────────────────────────────────────────────────────────────────────────────
// Server-owned cookies
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cookies the browser cannot clear for itself, so the reset endpoint expires
 * them on the redirect that starts a fresh visit.
 *
 * `y2k_vid` and `y2k_scratch` are httpOnly by design; `y2k_utm` and the legacy
 * `y2k_consent` are script-writable and would also be caught by the client
 * sweep, but expiring them server-side means the very first storefront request
 * of the new visit is already clean — including for a visitor with JavaScript
 * disabled, who never runs the sweep at all.
 *
 * Deliberately absent: the Better Auth session cookies. Signing the browser out
 * would take the admin's own console session with it, since both live under the
 * same cookie name. Use a private window to test the signed-out storefront.
 */
export const SERVER_VISITOR_COOKIES = [
  /** Anonymous first-party analytics id minted by POST /api/track. */
  "y2k_vid",
  /** Signed scratch-card prize draw (legacy; read by /api/subscribe). */
  "y2k_scratch",
  /** 30-day UTM attribution snapshot. */
  "y2k_utm",
  /** Retired consent banner cookie, still cleared on sight. */
  "y2k_consent",
  /** Locale override reserved by the i18n resolver. */
  "y2k_locale",
] as const;

/**
 * Marks a browsing session as internal QA so POST /api/track ignores it.
 *
 * httpOnly on purpose, and not only for the usual reasons: the client sweep
 * below deletes every `y2k_`-prefixed cookie it can see, and an httpOnly cookie
 * is not visible to `document.cookie`. The flag therefore survives the very
 * reset that sets it, which is exactly the behaviour required — the visit it
 * has to exclude is the one that happens *after* the wipe.
 */
export const QA_EXCLUSION_COOKIE = "y2k_qa_preview";

/**
 * Long enough for an unhurried QA pass, short enough that a forgotten flag
 * cannot quietly erase a day of the operator's own traffic from the Visitors
 * dashboard.
 */
export const QA_EXCLUSION_MAX_AGE_S = 2 * 60 * 60;

// ─────────────────────────────────────────────────────────────────────────────
// Landing path validation
// ─────────────────────────────────────────────────────────────────────────────

/** Generous enough for a filtered catalog URL, bounded against abuse. */
const MAX_LANDING_PATH_LENGTH = 512;

/**
 * Route namespaces a fresh visit may not land on.
 *
 * `/admin` and `/api` are not shopper surfaces; `/preview` is excluded because
 * forwarding the bootstrap to itself is an infinite loop.
 */
const BLOCKED_LANDING_PREFIXES = [
  "/admin",
  "/api",
  PREVIEW_ROUTE_PREFIX,
] as const;

/**
 * Normalise an operator-supplied landing path, or return null if it is not a
 * safe same-origin storefront destination.
 *
 * This is the open-redirect guard. It runs when a ticket is minted, again when
 * one is verified, and once more in the browser before the console will offer
 * the link — the signature makes tampering pointless, but a path that was valid
 * when signed and blocked by the time it is used must still be refused.
 */
export function normalizeLandingPath(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_LANDING_PATH_LENGTH) {
    return null;
  }
  // Must be root-relative. `//evil.com` and `/\evil.com` are read as
  // protocol-relative URLs by browsers, so both are rejected outright, as is
  // any control character or whitespace that could survive into a header.
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\u007f\s\\]/.test(trimmed)) return null;

  let url: URL;
  try {
    url = new URL(trimmed, "https://fresh-visit.invalid");
  } catch {
    return null;
  }
  // A relative resolve cannot change the origin unless the input smuggled one
  // in. Re-checking costs nothing and closes the whole class.
  if (url.origin !== "https://fresh-visit.invalid") return null;

  const blocked = BLOCKED_LANDING_PREFIXES.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
  );
  if (blocked) return null;

  return `${url.pathname}${url.search}${url.hash}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// The reset
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Forget everything this browser knows about the shopper.
 *
 * Browser-only and best-effort by design: Safari private mode and
 * storage-partitioned embeds throw on Web Storage access, and a QA convenience
 * must never be the thing that throws an exception at a real visitor. Each area
 * is cleared independently so one failure cannot skip the others.
 *
 * Callers must hard-navigate afterwards (`location.replace`, never the router):
 * the Zustand stores hold rehydrated copies of the cart and promo state in
 * module scope, and only a fresh document tears those down.
 */
export function clearStorefrontVisitorState(): void {
  if (typeof window === "undefined") return;

  for (const area of ["localStorage", "sessionStorage"] as const) {
    try {
      const store = window[area];
      // Collect first: removing during iteration re-indexes the store and
      // silently skips the key that shifts into the vacated slot.
      const doomed: string[] = [];
      for (let index = 0; index < store.length; index += 1) {
        const key = store.key(index);
        if (key && isStorefrontStateKey(key)) doomed.push(key);
      }
      for (const key of doomed) store.removeItem(key);
    } catch {
      // Storage is unavailable; there is nothing persisted to clear either.
    }
  }

  try {
    for (const entry of document.cookie.split(";")) {
      const name = entry.split("=")[0]?.trim();
      if (!name || !isStorefrontStateKey(name)) continue;
      // Expiry only takes effect on an exact (name, path) match, and these are
      // written at the root. The current path is cleared too, in case a cookie
      // was ever set from a nested route.
      for (const path of new Set(["/", window.location.pathname])) {
        document.cookie = `${name}=; path=${path}; max-age=0; samesite=lax`;
      }
    }
  } catch {
    // Cookie access is blocked; the server already expired the ones that matter.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Operator-facing inventory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What the reset covers, in the words of the person testing it.
 *
 * Rendered by the admin console so the tool documents itself, and so a tester
 * can tell at a glance whether the state they care about is included.
 */
export const FRESH_VISIT_RESET_INVENTORY: readonly {
  label: string;
  detail: string;
}[] = [
  {
    label: "Pop-up history",
    detail:
      "Welcome and cart-recovery impression counts, dismissal counts and the subscribed flag.",
  },
  {
    label: "Saved bag & promo code",
    detail: "The persisted cart and any auto-applied discount code.",
  },
  {
    label: "Browsing memory",
    detail: "Recently viewed products and the live-chat conversation marker.",
  },
  {
    label: "Attribution",
    detail: "UTM parameters and click IDs captured from a previous landing.",
  },
  {
    label: "Analytics identity",
    detail:
      "The first-party visitor cookie, so the storefront cannot recognise the browser.",
  },
] as const;

/**
 * What the reset deliberately leaves alone. Stated as plainly as the inventory
 * above, because a QA tool that quietly does less than a tester assumes is how
 * a bug gets signed off as fixed.
 */
export const FRESH_VISIT_RESET_EXCLUSIONS: readonly {
  label: string;
  detail: string;
}[] = [
  {
    label: "Your sign-in session",
    detail:
      "Customer and admin sessions share one cookie, so clearing it would sign you out of this console. Use a private window to test as a signed-out shopper.",
  },
  {
    label: "Browser cache & service workers",
    detail:
      "Assets already downloaded stay cached. A hard reload covers the rare case where that matters.",
  },
] as const;

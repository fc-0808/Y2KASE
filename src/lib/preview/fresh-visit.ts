/**
 * Fresh-visit tickets — SERVER ONLY.
 *
 * A short-lived, HMAC-signed ticket that authorises one clean-slate visit to
 * the storefront. The admin console mints it; `/api/preview/fresh-visit`
 * verifies it, expires the server-owned visitor cookies and hands off to the
 * `/preview/fresh-visit` bootstrap, which clears browser storage and forwards
 * to the landing page. From there the visit is indistinguishable from a real
 * first visit — no timing cheats, no suppressed pixels, no special code paths
 * in the storefront itself. Fidelity is the entire point: a rehearsal that
 * behaves differently from the performance cannot catch anything.
 *
 * WHY THE LINK IS SIGNED AT ALL
 * Not to protect a secret — the worst thing a stranger can do with a leaked
 * ticket is clear their own browser and land on the homepage. It is signed so
 * the *destination* and the *analytics decision* cannot be rewritten by whoever
 * holds the URL. Without a signature, `?to=` is an open redirect on the brand's
 * domain, and the analytics-exclusion flag becomes a way for any visitor to opt
 * out of being counted.
 *
 * WHY IT EXPIRES BUT IS NOT SINGLE-USE
 * Single use means server-side state (a nonce table, a row to write, a race to
 * lose) bought in exchange for approximately nothing, since replaying the link
 * only repeats a harmless local reset. A 30-minute window keeps a ticket pasted
 * into a chat thread from working next month, and reopening the same link three
 * times while testing keeps working, which is what an operator expects.
 *
 * The MAC payload is namespaced (`fresh-visit.v1.`) so a ticket can never be
 * confused with — or replayed against — the unsubscribe and scratch-card MACs
 * that share the same secret.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  FRESH_VISIT_ENTRY_PATH,
  FRESH_VISIT_TOKEN_PARAM,
} from "@/lib/preview/routes";
import { normalizeLandingPath } from "@/lib/preview/visitor-state";

/** How long a minted ticket stays usable. */
export const FRESH_VISIT_TTL_S = 30 * 60;

/** Payload schema version, mixed into the MAC so v1 tickets die with v1. */
const TOKEN_VERSION = 1;

/** A forged token should be rejected on sight, not JSON-parsed first. */
const MAX_TOKEN_LENGTH = 2_048;

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const HEX_RE = /^[a-f0-9]+$/;

export type FreshVisitTicket = {
  /** Root-relative storefront path the clean visit lands on. */
  path: string;
  /** Keep the resulting session out of first-party Visitors analytics. */
  excludeFromAnalytics: boolean;
  /** Epoch milliseconds at which the ticket stops working. */
  expiresAt: number;
};

/**
 * Why a ticket was refused.
 *
 * `invalid` covers both a malformed token and a bad signature: telling the
 * holder which one they got is free information for anyone probing the
 * endpoint, and useless to the operator, who regenerates either way.
 */
export type FreshVisitFailure = "missing" | "invalid" | "expired";

export type FreshVisitVerification =
  | { ok: true; ticket: FreshVisitTicket }
  | { ok: false; reason: FreshVisitFailure };

/** Narrow an untrusted string to a known failure reason. */
export function asFreshVisitFailure(value: unknown): FreshVisitFailure | null {
  return value === "missing" || value === "invalid" || value === "expired"
    ? value
    : null;
}

function secret(): string {
  const value =
    process.env.PREVIEW_LINK_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    "";
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "PREVIEW_LINK_SECRET or BETTER_AUTH_SECRET is required in production.",
    );
  }
  return "y2kase-local-fresh-visit-secret";
}

/**
 * No key rotation here, unlike unsubscribe links.
 *
 * A ticket lives for thirty minutes, so the longest a rotation can inconvenience
 * anyone is the time it takes to click "Regenerate". A legacy keyring would be
 * three environment variables that exist only to widen the set of secrets that
 * can mint a valid link.
 */
function sign(encodedPayload: string): string {
  return createHmac("sha256", secret())
    .update(`fresh-visit.v${TOKEN_VERSION}.${encodedPayload}`)
    .digest("hex");
}

type TokenPayload = {
  /** Schema version. */
  v: number;
  /** Landing path. */
  p: string;
  /** Exclude from first-party analytics. */
  x: 0 | 1;
  /** Expiry, epoch seconds. */
  e: number;
  /** Nonce — two tickets minted in the same second are still distinct URLs. */
  n: string;
};

export type MintFreshVisitOptions = {
  /** Where the clean visit should land. Must be a safe storefront path. */
  path: string;
  /** Keep the visit out of the Visitors dashboard. */
  excludeFromAnalytics: boolean;
  /** Override the default lifetime, in seconds. Used by tests. */
  ttlSeconds?: number;
};

export type MintedFreshVisit = {
  /** The signed ticket. */
  token: string;
  /**
   * Epoch milliseconds the ticket stops working.
   *
   * Returned rather than recomputed by the caller: the countdown in the admin
   * console and the expiry the endpoint enforces have to be the same instant,
   * and two `Date.now()` calls a few statements apart are not.
   */
  expiresAt: number;
};

/**
 * Mint a ticket for one clean visit.
 *
 * @throws if `path` is not a safe same-origin storefront destination. Callers
 *         take operator input, so they must normalise and report first — this
 *         throw is the backstop that keeps an unchecked path from being signed.
 */
export function mintFreshVisitToken(
  options: MintFreshVisitOptions,
): MintedFreshVisit {
  const path = normalizeLandingPath(options.path);
  if (!path) {
    throw new Error(`Unsafe fresh-visit landing path: ${options.path}`);
  }

  const ttl = Math.max(
    60,
    Math.min(options.ttlSeconds ?? FRESH_VISIT_TTL_S, 24 * 60 * 60),
  );
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + ttl;
  const payload: TokenPayload = {
    v: TOKEN_VERSION,
    p: path,
    x: options.excludeFromAnalytics ? 1 : 0,
    e: expiresAtSeconds,
    n: randomBytes(6).toString("base64url"),
  };

  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return {
    token: `${encoded}.${sign(encoded)}`,
    expiresAt: expiresAtSeconds * 1000,
  };
}

/** Constant-time MAC comparison that returns a verdict instead of throwing. */
function macMatches(candidate: string, expected: string): boolean {
  if (candidate.length !== expected.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(candidate, "utf8"),
      Buffer.from(expected, "utf8"),
    );
  } catch {
    return false;
  }
}

function decodePayload(encoded: string): TokenPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const { v, p, x, e, n } = parsed as Partial<TokenPayload>;
  if (v !== TOKEN_VERSION) return null;
  if (typeof p !== "string" || typeof n !== "string") return null;
  if (x !== 0 && x !== 1) return null;
  if (typeof e !== "number" || !Number.isFinite(e)) return null;
  return { v, p, x, e, n };
}

/**
 * Verify a ticket and recover what it authorises.
 *
 * Order matters: shape, then signature, then expiry, then the path rules. The
 * path is re-normalised even though it was checked at mint time, because the
 * blocklist can grow between the two — a signature proves a value was ours, not
 * that it is still allowed.
 */
export function verifyFreshVisitToken(
  token: string | null | undefined,
  /** Clock override. Production callers pass nothing; the CI guard uses it to
   *  assert the expiry branch without sleeping. */
  options: { now?: number } = {},
): FreshVisitVerification {
  if (!token) return { ok: false, reason: "missing" };
  if (token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "invalid" };

  const separator = token.lastIndexOf(".");
  if (separator <= 0 || separator === token.length - 1) {
    return { ok: false, reason: "invalid" };
  }

  const encoded = token.slice(0, separator);
  const mac = token.slice(separator + 1);
  if (!BASE64URL_RE.test(encoded) || !HEX_RE.test(mac)) {
    return { ok: false, reason: "invalid" };
  }
  if (!macMatches(mac, sign(encoded))) return { ok: false, reason: "invalid" };

  const payload = decodePayload(encoded);
  if (!payload) return { ok: false, reason: "invalid" };

  const expiresAt = payload.e * 1000;
  if ((options.now ?? Date.now()) >= expiresAt) {
    return { ok: false, reason: "expired" };
  }

  const path = normalizeLandingPath(payload.p);
  if (!path) return { ok: false, reason: "invalid" };

  return {
    ok: true,
    ticket: { path, excludeFromAnalytics: payload.x === 1, expiresAt },
  };
}

/**
 * The clickable link, root-relative.
 *
 * Deliberately not absolute: the admin console runs on localhost, on Vercel
 * preview domains and in production, and `NEXT_PUBLIC_SITE_URL` is pinned to
 * the canonical origin in all three. A relative href is always right for the
 * "open" button, and the console composes an absolute URL from
 * `window.location.origin` for the clipboard.
 */
export function freshVisitPath(token: string): string {
  return `${FRESH_VISIT_ENTRY_PATH}?${FRESH_VISIT_TOKEN_PARAM}=${encodeURIComponent(token)}`;
}

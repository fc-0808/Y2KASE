/**
 * Storefront auth destinations.
 *
 * Admin sign-in already sanitizes `?callbackUrl=`. The customer `/sign-in`
 * page did not — so a crafted link could bounce a signed-in shopper (or a
 * magic-link callback) onto an attacker origin. Every consumer of a callback
 * query must go through `safeStorefrontCallbackUrl`.
 */

import { sanitizeEmailParam } from "@/lib/email-address";

export const DEFAULT_STOREFRONT_CALLBACK = "/account/orders";

export const SIGN_IN_PATH = "/sign-in";

/** Query flag Better Auth appends on `newUserCallbackURL` after first sign-in. */
export const NEW_ACCOUNT_WELCOME_PARAM = "welcome";

export type SignInIntent = "orders" | "club" | "checkout";

const INTENTS = new Set<SignInIntent>(["orders", "club", "checkout"]);

const BLOCKED_CALLBACK_PREFIXES = ["/admin", "/api", "/sign-in"];

function callbackPathname(path: string): string {
  return path.split("?")[0]?.split("#")[0] ?? path;
}

function isBlockedCallbackPath(pathname: string): boolean {
  return BLOCKED_CALLBACK_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Resolve `?callbackUrl=` to a same-origin relative path the shopper is
 * allowed to land on after sign-in.
 *
 * Rejects absolute URLs, protocol-relative hosts (`//evil.com`), encoded
 * variants, control characters, and auth/admin/API destinations.
 */
export function safeStorefrontCallbackUrl(
  raw: string | null | undefined,
): string {
  if (!raw) return DEFAULT_STOREFRONT_CALLBACK;

  const trimmed = raw.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\")
  ) {
    return DEFAULT_STOREFRONT_CALLBACK;
  }
  if (/[\u0000-\u001f\u007f\s\\]/.test(trimmed)) {
    return DEFAULT_STOREFRONT_CALLBACK;
  }
  if (trimmed.length > 512) return DEFAULT_STOREFRONT_CALLBACK;

  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return DEFAULT_STOREFRONT_CALLBACK;
  }
  if (decoded.startsWith("//") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)) {
    return DEFAULT_STOREFRONT_CALLBACK;
  }

  let url: URL;
  try {
    url = new URL(trimmed, "https://auth-redirect.invalid");
  } catch {
    return DEFAULT_STOREFRONT_CALLBACK;
  }
  if (url.origin !== "https://auth-redirect.invalid") {
    return DEFAULT_STOREFRONT_CALLBACK;
  }
  if (isBlockedCallbackPath(url.pathname)) {
    return DEFAULT_STOREFRONT_CALLBACK;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function parseSignInIntent(
  raw: string | null | undefined,
): SignInIntent | null {
  if (!raw) return null;
  return INTENTS.has(raw as SignInIntent) ? (raw as SignInIntent) : null;
}

export function signInHref(opts?: {
  callbackUrl?: string;
  email?: string;
  intent?: SignInIntent;
}): string {
  const params = new URLSearchParams();
  const callback = safeStorefrontCallbackUrl(opts?.callbackUrl);
  params.set("callbackUrl", callback);
  const email = opts?.email ? sanitizeEmailParam(opts.email) : "";
  if (email) params.set("email", email);
  if (opts?.intent) params.set("intent", opts.intent);
  return `${SIGN_IN_PATH}?${params.toString()}`;
}

/**
 * Where "Continue as guest" should go. An account callback would just send
 * them back through `/sign-in`, so those fall through to the catalog home.
 */
export function guestContinueHref(callbackUrl: string): string {
  const pathname = callbackPathname(callbackUrl);
  if (pathname === "/account" || pathname.startsWith("/account/")) return "/";
  if (pathname === "/sign-in" || pathname.startsWith("/sign-in/")) return "/";
  return callbackUrl || "/";
}

/** Append `?welcome=1` (or `&welcome=1`) for Better Auth's new-user redirect. */
export function withNewAccountWelcome(callbackUrl: string): string {
  const safe = safeStorefrontCallbackUrl(callbackUrl);
  const url = new URL(safe, "https://auth-redirect.invalid");
  url.searchParams.set(NEW_ACCOUNT_WELCOME_PARAM, "1");
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Map Better Auth magic-link / OAuth error codes to copy the shopper can act on.
 * Unknown codes collapse to a generic retry so we never render attacker-supplied
 * `error_description` text.
 */
export function storefrontAuthErrorMessage(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  switch (code) {
    case "INVALID_TOKEN":
    case "invalid_token":
      return "That sign-in link expired or was already used. Request a fresh one below.";
    case "new_user_signup_disabled":
      return "Account creation is paused right now. Email hello@y2kase.com and we'll help.";
    case "failed_to_create_user":
    case "failed_to_create_session":
    case "user_not_found":
      return "We couldn't finish signing you in. Request a new link and try again.";
    case "account_not_linked":
      return "That email is already used with a different sign-in method. Use the original method, or email hello@y2kase.com.";
    case "access_denied":
      return "Sign-in was cancelled. You can try again whenever you're ready.";
    default:
      return "Sign-in didn't complete. Please try again.";
  }
}

export function isSignedInUser<T extends { isAnonymous?: boolean | null }>(
  user: T | null | undefined,
): user is T {
  return Boolean(user && !user.isAnonymous);
}

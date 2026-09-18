/**
 * Offline assertions for storefront auth redirects and sign-in URLs.
 *
 *   npx tsx scripts/check-auth-redirect.ts
 *
 * These are the invariants that keep `?callbackUrl=` from becoming an open
 * redirect, and that keep newsletter-vs-account CTAs pointing at a real
 * sign-in page rather than a dead `/sign-up` route.
 */
import assert from "node:assert/strict";

import {
  DEFAULT_STOREFRONT_CALLBACK,
  SIGN_IN_PATH,
  guestContinueHref,
  isSignedInUser,
  parseSignInIntent,
  safeStorefrontCallbackUrl,
  signInHref,
  storefrontAuthErrorMessage,
  withNewAccountWelcome,
} from "../src/lib/auth-redirect";
import {
  isValidEmail,
  normalizeEmail,
  sanitizeEmailParam,
} from "../src/lib/email-address";

assert.equal(safeStorefrontCallbackUrl(undefined), DEFAULT_STOREFRONT_CALLBACK);
assert.equal(safeStorefrontCallbackUrl(""), DEFAULT_STOREFRONT_CALLBACK);
assert.equal(safeStorefrontCallbackUrl("/account/orders"), "/account/orders");
assert.equal(
  safeStorefrontCallbackUrl("/products?device=iphone"),
  "/products?device=iphone",
);
assert.equal(
  safeStorefrontCallbackUrl("https://evil.com"),
  DEFAULT_STOREFRONT_CALLBACK,
);
assert.equal(
  safeStorefrontCallbackUrl("//evil.com"),
  DEFAULT_STOREFRONT_CALLBACK,
);
assert.equal(
  safeStorefrontCallbackUrl("/\\evil.com"),
  DEFAULT_STOREFRONT_CALLBACK,
);
assert.equal(
  safeStorefrontCallbackUrl("/%2f%2fevil.com"),
  DEFAULT_STOREFRONT_CALLBACK,
);
assert.equal(
  safeStorefrontCallbackUrl("/sign-in"),
  DEFAULT_STOREFRONT_CALLBACK,
);
assert.equal(
  safeStorefrontCallbackUrl("/admin/products"),
  DEFAULT_STOREFRONT_CALLBACK,
);
assert.equal(
  safeStorefrontCallbackUrl("/api/auth/ok"),
  DEFAULT_STOREFRONT_CALLBACK,
);
assert.equal(
  safeStorefrontCallbackUrl("/account/orders\nhttps://evil.com"),
  DEFAULT_STOREFRONT_CALLBACK,
);

assert.equal(guestContinueHref("/account/orders"), "/");
assert.equal(guestContinueHref("/cart"), "/cart");
assert.equal(guestContinueHref("/sign-in"), "/");

assert.equal(parseSignInIntent("club"), "club");
assert.equal(parseSignInIntent("nope"), null);

assert.equal(
  signInHref({ email: "Bestie@Y2KASE.com", intent: "club" }),
  `${SIGN_IN_PATH}?callbackUrl=${encodeURIComponent(DEFAULT_STOREFRONT_CALLBACK)}&email=bestie%40y2kase.com&intent=club`,
);
assert.equal(
  signInHref({ email: "not-an-email" }),
  `${SIGN_IN_PATH}?callbackUrl=${encodeURIComponent(DEFAULT_STOREFRONT_CALLBACK)}`,
);

assert.equal(
  withNewAccountWelcome("/account/orders"),
  "/account/orders?welcome=1",
);
assert.equal(
  withNewAccountWelcome("/products?device=iphone"),
  "/products?device=iphone&welcome=1",
);

assert.match(
  storefrontAuthErrorMessage("INVALID_TOKEN") ?? "",
  /expired or was already used/i,
);
assert.equal(storefrontAuthErrorMessage("<script>"), "Sign-in didn't complete. Please try again.");

assert.equal(isSignedInUser(null), false);
assert.equal(isSignedInUser({ isAnonymous: true }), false);
assert.equal(isSignedInUser({ isAnonymous: false }), true);
assert.equal(isSignedInUser({}), true);

assert.equal(normalizeEmail("  Jenny@Gmail.COM "), "jenny@gmail.com");
assert.equal(isValidEmail("jenny@gmail.com"), true);
assert.equal(isValidEmail("nope"), false);
assert.equal(sanitizeEmailParam("Jenny@Gmail.COM"), "jenny@gmail.com");
assert.equal(sanitizeEmailParam("<svg>"), "");

console.log("check-auth-redirect: ok");

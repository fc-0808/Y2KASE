/**
 * Fresh-visit QA tooling invariants — pure, offline, no secrets.
 *
 * Two classes of assertion live here. The first is ordinary crypto/parsing
 * coverage: a ticket must survive a round trip, and any edit to it must not.
 * The second is the one that earns its keep — a signed link that carries a
 * destination is an open redirect the moment the path guard slips, and the guard
 * is a single function that is easy to "simplify". So every hostile input we
 * know of is pinned here, alongside the source-level ordering the reset depends
 * on to actually be a reset.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { isTrackablePath } from "../src/lib/analytics/paths";
import { UTM_COOKIE } from "../src/lib/analytics/utm";
import {
  CART_RECOVERY_POLICY,
  WELCOME_POPUP_POLICY,
} from "../src/lib/marketing/popup-policy";
import { SCRATCH_COOKIE } from "../src/lib/scratch";
import {
  FRESH_VISIT_TTL_S,
  freshVisitPath,
  mintFreshVisitToken,
  verifyFreshVisitToken,
} from "../src/lib/preview/fresh-visit";
import {
  FRESH_VISIT_BOOTSTRAP_PATH,
  FRESH_VISIT_ENTRY_PATH,
  PREVIEW_ROUTE_PREFIX,
} from "../src/lib/preview/routes";
import {
  FRESH_VISIT_RESET_INVENTORY,
  QA_EXCLUSION_COOKIE,
  SERVER_VISITOR_COOKIES,
  isStorefrontStateKey,
  normalizeLandingPath,
} from "../src/lib/preview/visitor-state";

// ─── Ticket round trip ───────────────────────────────────────────────────────

const minted = mintFreshVisitToken({
  path: "/products?device=iphone#grid",
  excludeFromAnalytics: true,
});
const token = minted.token;
const verified = verifyFreshVisitToken(token);
assert.equal(verified.ok, true, "a freshly minted ticket must verify");
if (verified.ok) {
  assert.equal(verified.ticket.path, "/products?device=iphone#grid");
  assert.equal(verified.ticket.excludeFromAnalytics, true);
  assert.ok(verified.ticket.expiresAt > Date.now());
  assert.equal(
    verified.ticket.expiresAt,
    minted.expiresAt,
    "the expiry shown to the operator must be the expiry the endpoint enforces",
  );
}

const plainTicket = verifyFreshVisitToken(
  mintFreshVisitToken({ path: "/", excludeFromAnalytics: false }).token,
);
assert.equal(plainTicket.ok, true);
if (plainTicket.ok) {
  assert.equal(
    plainTicket.ticket.excludeFromAnalytics,
    false,
    "the analytics decision must survive the round trip unchanged",
  );
}

// Two tickets for identical options must still be distinct URLs, so a link
// pasted somewhere durable can never be mistaken for the current one.
assert.notEqual(
  mintFreshVisitToken({ path: "/", excludeFromAnalytics: false }).token,
  mintFreshVisitToken({ path: "/", excludeFromAnalytics: false }).token,
);

assert.ok(freshVisitPath(token).startsWith(`${FRESH_VISIT_ENTRY_PATH}?`));

// ─── Forgery and tampering ───────────────────────────────────────────────────

assert.equal(verifyFreshVisitToken(null).ok, false);
assert.equal(verifyFreshVisitToken("").ok, false);
assert.equal(verifyFreshVisitToken(undefined).ok, false);

const [encoded, mac] = token.split(".");
assert.ok(encoded && mac);

// A payload rewritten to point somewhere else, keeping the original signature.
const hostilePayload = Buffer.from(
  JSON.stringify({ v: 1, p: "//evil.example", x: 1, e: 1e10, n: "aaaaaaaa" }),
  "utf8",
).toString("base64url");
assert.deepEqual(verifyFreshVisitToken(`${hostilePayload}.${mac}`), {
  ok: false,
  reason: "invalid",
});

// A flipped signature byte, and a truncated one.
const flipped = `${mac.slice(0, -1)}${mac.endsWith("a") ? "b" : "a"}`;
assert.deepEqual(verifyFreshVisitToken(`${encoded}.${flipped}`), {
  ok: false,
  reason: "invalid",
});
assert.deepEqual(verifyFreshVisitToken(`${encoded}.${mac.slice(0, -2)}`), {
  ok: false,
  reason: "invalid",
});
assert.deepEqual(verifyFreshVisitToken(encoded), {
  ok: false,
  reason: "invalid",
});
assert.deepEqual(verifyFreshVisitToken(`${encoded}.`), {
  ok: false,
  reason: "invalid",
});
assert.deepEqual(verifyFreshVisitToken(`.${mac}`), {
  ok: false,
  reason: "invalid",
});
assert.deepEqual(verifyFreshVisitToken(`${"x".repeat(5_000)}.${mac}`), {
  ok: false,
  reason: "invalid",
});

// ─── Expiry ──────────────────────────────────────────────────────────────────

const shortLived = mintFreshVisitToken({
  path: "/",
  excludeFromAnalytics: false,
  ttlSeconds: 60,
}).token;
assert.equal(verifyFreshVisitToken(shortLived).ok, true);
assert.deepEqual(
  verifyFreshVisitToken(shortLived, { now: Date.now() + 61_000 }),
  { ok: false, reason: "expired" },
  "a ticket past its expiry must be refused, not merely discouraged",
);
assert.ok(FRESH_VISIT_TTL_S > 0 && FRESH_VISIT_TTL_S <= 24 * 60 * 60);

// ─── Landing path guard (the open-redirect boundary) ─────────────────────────

for (const safe of [
  "/",
  "/products",
  "/products?device=iphone&page=2",
  "/collections/kawaii#top",
  "/welcome-gift",
]) {
  assert.equal(normalizeLandingPath(safe), safe, `${safe} must be allowed`);
}

for (const hostile of [
  "//evil.example",
  "//evil.example/products",
  "/\\evil.example",
  "https://evil.example",
  "http://evil.example",
  "evil.example",
  "javascript:alert(1)",
  "",
  "   ",
  "/products\nLocation: https://evil.example",
  "/products\r\nSet-Cookie: a=b",
  "/products\u0000",
  "/admin",
  "/admin/orders",
  "/api",
  "/api/track",
  PREVIEW_ROUTE_PREFIX,
  FRESH_VISIT_BOOTSTRAP_PATH,
  `${FRESH_VISIT_BOOTSTRAP_PATH}/nested`,
  `/${"a".repeat(600)}`,
  null,
  undefined,
  42,
  { path: "/" },
]) {
  assert.equal(
    normalizeLandingPath(hostile as string),
    null,
    `${JSON.stringify(hostile)} must be rejected as a landing path`,
  );
}

// Paths that merely start with a blocked word are ordinary storefront routes.
assert.equal(normalizeLandingPath("/administrator"), "/administrator");
assert.equal(normalizeLandingPath("/apixel"), "/apixel");

// Minting must refuse what verification would refuse — a signature over an
// unsafe path is the one thing that could turn this feature into a redirector.
assert.throws(() =>
  mintFreshVisitToken({ path: "//evil.example", excludeFromAnalytics: false }),
);
assert.throws(() =>
  mintFreshVisitToken({ path: "/admin", excludeFromAnalytics: false }),
);

// ─── Storage sweep coverage ──────────────────────────────────────────────────

for (const key of [
  "y2k_popup_shown_at",
  "y2k_popup_dismiss_count",
  "y2k_popup_subscribed",
  "y2k_cart_recovery_shown_at",
  "y2k_cart_recovery_dismiss_count",
  "y2k_cart_recovery_dismissed_at",
  "y2k_marketing_popup_campaign",
  "y2k_recently_viewed",
  "y2k_support_chat_at",
  "y2k_utm_session",
  "y2k_purchase_cs_test_123",
  "y2kase-cart",
  "y2kase-promo",
]) {
  assert.ok(isStorefrontStateKey(key), `${key} must be cleared by a fresh visit`);
}
for (const foreign of ["theme", "ph_session", "__stripe_mid", "Y2K_POPUP"]) {
  assert.equal(
    isStorefrontStateKey(foreign),
    false,
    `${foreign} is not ours to delete`,
  );
}

// Cookie names are declared in the features that write them; drift here means
// the reset silently stops clearing one of them.
for (const cookie of [SCRATCH_COOKIE, UTM_COOKIE, "y2k_vid"]) {
  assert.ok(
    SERVER_VISITOR_COOKIES.includes(cookie as (typeof SERVER_VISITOR_COOKIES)[number]),
    `${cookie} must be expired by the fresh-visit entry route`,
  );
}

// The exclusion flag has to outlive the sweep that runs immediately after it is
// set. It shares the swept namespace, so httpOnly is what saves it — assert both
// halves of that argument.
assert.ok(isStorefrontStateKey(QA_EXCLUSION_COOKIE));

assert.ok(FRESH_VISIT_RESET_INVENTORY.length > 0);

// ─── Analytics path predicate ────────────────────────────────────────────────

for (const tracked of ["/", "/products", "/administrator", "/apixel", "/blog/x"]) {
  assert.ok(isTrackablePath(tracked), `${tracked} must stay countable`);
}
for (const untracked of [
  "/admin",
  "/admin/visitors",
  "/api",
  "/api/track",
  PREVIEW_ROUTE_PREFIX,
  FRESH_VISIT_BOOTSTRAP_PATH,
  "not-a-path",
]) {
  assert.equal(
    isTrackablePath(untracked),
    false,
    `${untracked} must not be recorded as storefront traffic`,
  );
}

// ─── Source-level invariants ─────────────────────────────────────────────────

const entryRoute = readFileSync(
  "src/app/api/preview/fresh-visit/route.ts",
  "utf8",
);
assert.match(
  entryRoute,
  /httpOnly: true/,
  "the QA exclusion cookie must be httpOnly so the client sweep cannot remove it",
);
assert.match(entryRoute, /Cache-Control/, "the reset redirect must not be cached");

// `isTrackablePath` runs inside the root-layout beacon, so its import graph is
// on every shopper's critical path. It may read the route constants and nothing
// else.
const pathsModule = readFileSync("src/lib/analytics/paths.ts", "utf8");
assert.doesNotMatch(
  pathsModule,
  /visitor-state/,
  "the analytics path predicate must not pull operator-facing copy into the root layout",
);

assert.match(
  readFileSync("src/app/robots.ts", "utf8"),
  new RegExp(`${PREVIEW_ROUTE_PREFIX}/`),
  "QA surfaces must be disallowed for crawlers",
);

const trackRoute = readFileSync("src/app/api/track/route.ts", "utf8");
assert.ok(
  trackRoute.indexOf("QA_EXCLUSION_COOKIE") <
    trackRoute.indexOf("crypto.randomUUID()"),
  "an excluded visit must be dropped before a visitor id is minted",
);

// The bootstrap path is a constant, and the route that answers it is a folder on
// disk. Deriving the filename from the constant pins them together — including
// the App Router rule that made this bite once already: a folder whose name
// starts with an underscore is private, so the page silently stops being a route
// and the reset dead-ends on a 404 with the cookies already cleared.
const bootstrapDirectory = `src/app${FRESH_VISIT_BOOTSTRAP_PATH}`;
assert.doesNotMatch(
  FRESH_VISIT_BOOTSTRAP_PATH,
  /(^|\/)_/,
  "the bootstrap path must not sit in a Next.js private folder",
);
assert.ok(
  existsSync(`${bootstrapDirectory}/page.tsx`),
  `${FRESH_VISIT_BOOTSTRAP_PATH} must be served by ${bootstrapDirectory}/page.tsx`,
);

const bootstrap = readFileSync(
  `${bootstrapDirectory}/FreshVisitBootstrap.tsx`,
  "utf8",
);
assert.match(
  bootstrap,
  /window\.location\.replace/,
  "the hand-off must be a document load, or the cleared stores stay in memory",
);
assert.doesNotMatch(
  bootstrap,
  /useRouter|next\/navigation/,
  "a client-side transition would reuse the document the reset just cleared",
);

// The admin console quotes these timings to the tester, so they have to be the
// numbers the dialogs actually run on.
const welcomePopup = readFileSync("src/components/EmailCapturePop.tsx", "utf8");
const recoveryPopup = readFileSync("src/components/CartRecoveryPop.tsx", "utf8");
assert.match(welcomePopup, /WELCOME_POPUP_POLICY/);
assert.match(recoveryPopup, /CART_RECOVERY_POLICY/);
assert.ok(WELCOME_POPUP_POLICY.delayMs > 0);
assert.ok(CART_RECOVERY_POLICY.touchIdleDelayMs > CART_RECOVERY_POLICY.exitArmDelayMs);

console.log("✓ fresh-visit preview invariants passed");

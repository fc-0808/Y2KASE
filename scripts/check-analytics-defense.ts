/**
 * Offline regression checks for the first-party analytics trust boundary.
 *
 * The production incident behind these assertions used one ordinary-looking
 * Chrome UA, hundreds of rotating addresses and a new cookie on every request.
 * These checks pin every independent layer that now prevents that pattern from
 * becoming "unique visitors" again.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  ABUSIVE_ANALYTICS_IPV4_CIDRS,
  ANALYTICS_EXCLUDED_IP_REGEX,
  analyticsFingerprintKey,
  analyticsNetworkKey,
  analyticsRequestRejection,
  automationRejection,
  isBotUserAgent,
  isExcludedAnalyticsIp,
  isValidVisitorId,
  normalizeClientIp,
} from "../src/lib/analytics/bot-defense";
import {
  ANALYTICS_MARKER_HEADER,
  ANALYTICS_MARKER_VALUE,
  ANALYTICS_VISITOR_COOKIE,
  ANALYTICS_VISITOR_PROOF_COOKIE,
} from "../src/lib/analytics/protocol";
import {
  createVisitorProof,
  verifyVisitorProof,
} from "../src/lib/analytics/visitor-cookie";
import { SERVER_VISITOR_COOKIES } from "../src/lib/preview/visitor-state";

const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

function browserHeaders(overrides: Record<string, string> = {}): Headers {
  return new Headers({
    [ANALYTICS_MARKER_HEADER]: ANALYTICS_MARKER_VALUE,
    "content-type": "application/json",
    "content-length": "128",
    origin: "https://y2kase.com",
    host: "y2kase.com",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
    "sec-ch-ua-platform": '"macOS"',
    "sec-ch-ua-mobile": "?0",
    ...overrides,
  });
}

// ── Network intelligence ─────────────────────────────────────────────────────

assert.deepEqual(ABUSIVE_ANALYTICS_IPV4_CIDRS, [
  "43.119.100.0/24",
  "43.119.104.0/24",
  "47.82.201.0/24",
  "47.82.202.0/24",
]);
for (const ip of [
  "43.119.100.1",
  "43.119.104.254",
  "47.82.201.68",
  "47.82.202.200",
  "::ffff:43.119.100.141",
]) {
  assert.equal(isExcludedAnalyticsIp(ip), true, `${ip} must be excluded`);
  assert.match(normalizeClientIp(ip) ?? "", new RegExp(ANALYTICS_EXCLUDED_IP_REGEX));
}
for (const adjacent of [
  "43.119.99.255",
  "43.119.101.1",
  "43.119.105.1",
  "47.82.200.255",
  "47.82.203.1",
]) {
  assert.equal(
    isExcludedAnalyticsIp(adjacent),
    false,
    `${adjacent} is outside the confirmed /24s`,
  );
}
assert.equal(isExcludedAnalyticsIp("66.249.66.1"), true, "Googlebot range");
assert.equal(isExcludedAnalyticsIp("not-an-ip"), false);
assert.equal(normalizeClientIp("999.1.1.1"), null);

assert.equal(analyticsNetworkKey("43.119.100.141"), "v4:43.119.100.0/24");
assert.equal(
  analyticsNetworkKey("::ffff:43.119.100.141"),
  "v4:43.119.100.0/24",
);
assert.equal(
  analyticsNetworkKey("2001:db8:abcd:12::1"),
  "v6:2001:0db8:abcd:0012/64",
);
assert.equal(
  analyticsNetworkKey("2001:0db8:abcd:0012:ffff::2"),
  "v6:2001:0db8:abcd:0012/64",
);

// ── User-Agent and browser integrity ─────────────────────────────────────────

assert.equal(isBotUserAgent(MAC_CHROME), false);
for (const bot of [
  "Googlebot/2.1 (+http://www.google.com/bot.html)",
  "Mozilla/5.0 HeadlessChrome/145.0.0.0",
  "Playwright/1.55",
  "python-requests/2.32",
  "",
]) {
  assert.equal(isBotUserAgent(bot), true, `${bot || "(empty UA)"} must be a bot`);
}

assert.equal(analyticsRequestRejection(browserHeaders()), null);
assert.equal(
  analyticsRequestRejection(
    browserHeaders({ [ANALYTICS_MARKER_HEADER]: "stale" }),
  ),
  "missing_marker",
);
assert.equal(
  analyticsRequestRejection(browserHeaders({ "content-type": "text/plain" })),
  "invalid_content_type",
);
assert.equal(
  analyticsRequestRejection(browserHeaders({ "content-length": "2049" })),
  "invalid_content_length",
);
assert.equal(
  analyticsRequestRejection(
    browserHeaders({
      origin: "https://evil.example",
      "sec-fetch-site": "cross-site",
    }),
  ),
  "cross_site",
);
assert.equal(
  analyticsRequestRejection(
    browserHeaders({ origin: "https://evil.example" }),
  ),
  "origin_mismatch",
);
assert.equal(
  analyticsRequestRejection(browserHeaders({ "sec-fetch-dest": "document" })),
  "invalid_fetch_destination",
);

assert.equal(
  automationRejection({
    headers: browserHeaders(),
    userAgent: MAC_CHROME,
    webdriver: false,
    runtimePlatform: "MacIntel",
  }),
  null,
);
assert.equal(
  automationRejection({
    headers: browserHeaders(),
    userAgent: MAC_CHROME,
    webdriver: true,
    runtimePlatform: "MacIntel",
  }),
  "webdriver",
);
assert.equal(
  automationRejection({
    headers: browserHeaders({ "sec-ch-ua-platform": '"Linux"' }),
    userAgent: MAC_CHROME,
    webdriver: false,
    runtimePlatform: "Linux x86_64",
  }),
  "client_hint_platform_mismatch",
);
assert.equal(
  automationRejection({
    headers: browserHeaders(),
    userAgent: MAC_CHROME,
    webdriver: false,
    runtimePlatform: "Linux x86_64",
  }),
  "runtime_platform_mismatch",
);

// ── Signed visitor-cookie handshake ──────────────────────────────────────────

const previousSecret = process.env.ANALYTICS_COOKIE_SECRET;
process.env.ANALYTICS_COOKIE_SECRET = "offline-analytics-defense-test-secret";
try {
  const visitorId = randomUUID();
  const proof = createVisitorProof(visitorId);
  assert.equal(isValidVisitorId(visitorId), true);
  assert.equal(verifyVisitorProof(visitorId, proof), true);
  assert.equal(verifyVisitorProof(randomUUID(), proof), false);
  assert.equal(verifyVisitorProof(visitorId, `${proof.slice(0, -1)}x`), false);
  assert.equal(verifyVisitorProof("attacker-controlled-id", proof), false);
} finally {
  if (previousSecret === undefined) {
    delete process.env.ANALYTICS_COOKIE_SECRET;
  } else {
    process.env.ANALYTICS_COOKIE_SECRET = previousSecret;
  }
}

assert.ok(SERVER_VISITOR_COOKIES.includes(ANALYTICS_VISITOR_COOKIE));
assert.ok(SERVER_VISITOR_COOKIES.includes(ANALYTICS_VISITOR_PROOF_COOKIE));

// The anomaly bucket is stable for one browser fingerprint and changes when a
// material signal changes. It is deliberately not a persistent user identity.
assert.equal(
  analyticsFingerprintKey([MAC_CHROME, "SG", '"Chromium"', '"macOS"']),
  analyticsFingerprintKey([MAC_CHROME, "SG", '"Chromium"', '"macOS"']),
);
assert.notEqual(
  analyticsFingerprintKey([MAC_CHROME, "SG", '"Chromium"', '"macOS"']),
  analyticsFingerprintKey([MAC_CHROME, "US", '"Chromium"', '"macOS"']),
);

// ── Integration ordering ─────────────────────────────────────────────────────

const route = readFileSync("src/app/api/track/route.ts", "utf8");
assert.ok(
  route.indexOf("isExcludedAnalyticsIp(ip)") <
    route.indexOf("readBeaconBody(req)"),
  "known abuse must be dropped before its body is parsed",
);
assert.ok(
  route.indexOf("verifyVisitorProof(visitorId, proof)") <
    route.indexOf("recordPageView({"),
  "an unsigned visitor id must never reach persistence",
);
assert.doesNotMatch(
  route,
  /await req\.json\(\)/,
  "the route must retain its streaming body-size guard",
);

const tracker = readFileSync("src/components/VisitorTracker.tsx", "utf8");
assert.match(tracker, /ANALYTICS_VISITOR_SEEDED_HEADER/);
assert.match(tracker, /credentials: "same-origin"/);
assert.match(tracker, /navigator\.webdriver === true/);

console.log("✓ analytics bot-defense invariants passed");

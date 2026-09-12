/**
 * Route-level analytics handshake check.
 *
 * Runs with DATABASE_URL deliberately absent, so the second (accepted) beacon
 * exercises the complete handler without writing a row anywhere.
 */
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/track/route";
import {
  ANALYTICS_MARKER_HEADER,
  ANALYTICS_MARKER_VALUE,
  ANALYTICS_VISITOR_COOKIE,
  ANALYTICS_VISITOR_PROOF_COOKIE,
  ANALYTICS_VISITOR_SEEDED_HEADER,
  ANALYTICS_VISITOR_SEEDED_VALUE,
} from "../src/lib/analytics/protocol";
import { verifyVisitorProof } from "../src/lib/analytics/visitor-cookie";

const previousDatabaseUrl = process.env.DATABASE_URL;
const previousAnalyticsSecret = process.env.ANALYTICS_COOKIE_SECRET;

function request(overrides: {
  cookie?: string;
  ip?: string;
  origin?: string;
  path?: string;
  webdriver?: boolean;
} = {}): NextRequest {
  const headers = new Headers({
    [ANALYTICS_MARKER_HEADER]: ANALYTICS_MARKER_VALUE,
    "content-type": "application/json",
    host: "y2kase.com",
    origin: overrides.origin ?? "https://y2kase.com",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
    "sec-ch-ua": '"Chromium";v="145", "Google Chrome";v="145"',
    "sec-ch-ua-platform": '"macOS"',
    "sec-ch-ua-mobile": "?0",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "x-forwarded-for": overrides.ip ?? "203.0.113.9",
    "x-vercel-ip-country": "US",
  });
  if (overrides.cookie) headers.set("cookie", overrides.cookie);

  return new NextRequest("https://y2kase.com/api/track", {
    method: "POST",
    headers,
    body: JSON.stringify({
      path: overrides.path ?? "/products",
      referrer: "https://www.google.com/",
      webdriver: overrides.webdriver ?? false,
      platform: "macOS",
    }),
  });
}

async function main(): Promise<void> {
  delete process.env.DATABASE_URL;
  process.env.ANALYTICS_COOKIE_SECRET =
    "offline-analytics-route-handshake-secret";

  try {
    const first = await POST(request());
    assert.equal(first.status, 204);
    assert.equal(
      first.headers.get(ANALYTICS_VISITOR_SEEDED_HEADER),
      ANALYTICS_VISITOR_SEEDED_VALUE,
    );
    const visitorId = first.cookies.get(ANALYTICS_VISITOR_COOKIE)?.value;
    const proof = first.cookies.get(ANALYTICS_VISITOR_PROOF_COOKIE)?.value;
    assert.ok(visitorId, "the handshake must mint a visitor id");
    assert.ok(proof, "the handshake must mint an HMAC proof");
    assert.equal(verifyVisitorProof(visitorId, proof), true);

    const accepted = await POST(
      request({
        cookie: `${ANALYTICS_VISITOR_COOKIE}=${visitorId}; ${ANALYTICS_VISITOR_PROOF_COOKIE}=${proof}`,
      }),
    );
    assert.equal(accepted.status, 204);
    assert.equal(
      accepted.headers.get(ANALYTICS_VISITOR_SEEDED_HEADER),
      null,
      "a proven browser must pass without another handshake",
    );
    assert.equal(accepted.cookies.getAll().length, 0);

    const automated = await POST(request({ webdriver: true }));
    assert.equal(
      automated.cookies.getAll().length,
      0,
      "webdriver traffic must be dropped before a visitor cookie is minted",
    );

    const blockedNetwork = await POST(request({ ip: "43.119.100.141" }));
    assert.equal(
      blockedNetwork.cookies.getAll().length,
      0,
      "a confirmed abuse range must be dropped before the handshake",
    );

    const hostilePath = await POST(request({ path: "//evil.example/phish" }));
    assert.equal(
      hostilePath.cookies.getAll().length,
      0,
      "protocol-relative paths must never reach the admin visit log",
    );

    const crossSite = request({ origin: "https://evil.example" });
    crossSite.headers.set("sec-fetch-site", "cross-site");
    const rejectedOrigin = await POST(crossSite);
    assert.equal(rejectedOrigin.cookies.getAll().length, 0);

    console.log("✓ analytics route handshake passed");
  } finally {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
    if (previousAnalyticsSecret === undefined) {
      delete process.env.ANALYTICS_COOKIE_SECRET;
    } else {
      process.env.ANALYTICS_COOKIE_SECRET = previousAnalyticsSecret;
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

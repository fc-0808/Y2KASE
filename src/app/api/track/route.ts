/**
 * POST /api/track — first-party visitor analytics beacon.
 *
 * The client (`<VisitorTracker />`) sends a small same-origin beacon on each
 * page view. The server is the source of truth for everything sensitive or
 * spoofable: it validates browser context, filters network/automation signals,
 * derives edge geolocation, and requires a signed first-party visitor-cookie
 * round trip before a view can enter unique-visitor reporting.
 *
 * Returns 204 No Content. Analytics must never affect the user experience, so
 * every failure mode degrades silently.
 */
import { NextResponse, type NextRequest } from "next/server";
import { parseUserAgent, recordPageView } from "@/lib/analytics";
import {
  analyticsFingerprintKey,
  analyticsNetworkKey,
  analyticsRequestRejection,
  automationRejection,
  isExcludedAnalyticsIp,
  isValidVisitorId,
  normalizeClientIp,
} from "@/lib/analytics/bot-defense";
import { isTrackablePath } from "@/lib/analytics/paths";
import {
  ANALYTICS_VISITOR_COOKIE,
  ANALYTICS_VISITOR_PROOF_COOKIE,
  ANALYTICS_VISITOR_SEEDED_HEADER,
  ANALYTICS_VISITOR_SEEDED_VALUE,
  MAX_ANALYTICS_REQUEST_BYTES,
  type AnalyticsBeaconPayload,
} from "@/lib/analytics/protocol";
import {
  createVisitorProof,
  verifyVisitorProof,
} from "@/lib/analytics/visitor-cookie";
import { QA_EXCLUSION_COOKIE } from "@/lib/preview/visitor-state";
import { hit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const ONE_YEAR = 60 * 60 * 24 * 365;
const SESSION_COOKIES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
] as const;

const MINUTE = 60_000;

/** Pull the first public IP from the proxy chain. */
function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip");
}

/** Vercel sets these on every request at the edge; absent in local dev. */
function geo(req: NextRequest) {
  const h = req.headers;
  const dec = (v: string | null) => {
    if (!v) return null;
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  return {
    country: dec(h.get("x-vercel-ip-country")),
    region: dec(h.get("x-vercel-ip-country-region")),
    city: dec(h.get("x-vercel-ip-city")),
    latitude: h.get("x-vercel-ip-latitude"),
    longitude: h.get("x-vercel-ip-longitude"),
    timezone: dec(h.get("x-vercel-ip-timezone")),
  };
}

function noContent(extraHeaders?: Record<string, string>): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      ...extraHeaders,
    },
  });
}

function seedVisitorCookies(existingVisitorId?: string): NextResponse {
  const visitorId = existingVisitorId && isValidVisitorId(existingVisitorId)
    ? existingVisitorId
    : crypto.randomUUID();
  const response = noContent({
    [ANALYTICS_VISITOR_SEEDED_HEADER]: ANALYTICS_VISITOR_SEEDED_VALUE,
  });
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: ONE_YEAR,
    path: "/",
  };
  response.cookies.set(ANALYTICS_VISITOR_COOKIE, visitorId, options);
  response.cookies.set(
    ANALYTICS_VISITOR_PROOF_COOKIE,
    createVisitorProof(visitorId),
    options,
  );
  return response;
}

/**
 * Read a tiny JSON body with a streaming hard limit. Content-Length is only a
 * hint; a custom client can omit it and send a chunked body.
 */
async function readBeaconBody(
  req: NextRequest,
): Promise<Partial<AnalyticsBeaconPayload> | null> {
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_ANALYTICS_REQUEST_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Partial<AnalyticsBeaconPayload>;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

function trackedPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    return null;
  }
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\") ||
    /[\u0000-\u001f\u007f\s\\]/.test(value)
  ) {
    return null;
  }

  try {
    const url = new URL(value, "https://analytics.invalid");
    if (
      url.origin !== "https://analytics.invalid" ||
      url.search ||
      url.hash ||
      !isTrackablePath(url.pathname)
    ) {
      return null;
    }
    return url.pathname;
  } catch {
    return null;
  }
}

function safeReferrer(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 512) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const ip = normalizeClientIp(clientIp(req));

  // The edge firewall owns the first line of defense. Repeating the exact
  // network deny here protects preview hosts and keeps capture safe if firewall
  // configuration drifts.
  if (isExcludedAnalyticsIp(ip)) return noContent();

  // An operator walking the storefront from a fresh-visit link is rehearsing,
  // not shopping. Dropping the beacon before it mints `y2k_vid` keeps the run
  // out of the Visitors dashboard *and* leaves the browser unidentified, so a
  // second pass is as anonymous as the first.
  if (req.cookies.has(QA_EXCLUSION_COOKIE)) {
    return noContent();
  }

  // Reject requests that could not have been emitted by the current same-origin
  // tracker before parsing attacker-controlled input.
  if (analyticsRequestRejection(req.headers)) return noContent();

  // A real shopper cannot produce 30 route changes in one minute. This local
  // limiter is intentionally only a backstop; the network/fingerprint buckets
  // below catch rotation, and Vercel's edge block is globally enforced.
  if (ip && !hit(`track:ip:${ip}`, { limit: 30, windowMs: MINUTE }).ok) {
    return noContent();
  }

  const body = await readBeaconBody(req);
  if (!body) return noContent();
  const path = trackedPath(body.path);
  if (!path) return noContent();
  const referrer = safeReferrer(body.referrer);

  const ua = req.headers.get("user-agent");
  const parsed = parseUserAgent(ua);

  // The maintained UA corpus catches declared crawlers; positive browser
  // automation and contradictory platform hints catch common stealth drivers.
  if (parsed.device === "bot" || !ua) return noContent();
  const runtimePlatform =
    typeof body.platform === "string" && body.platform.length <= 64
      ? body.platform
      : null;
  if (
    automationRejection({
      headers: req.headers,
      userAgent: ua,
      webdriver: body.webdriver === true,
      runtimePlatform,
    })
  ) {
    return noContent();
  }

  const g = geo(req);
  const network = analyticsNetworkKey(ip);
  if (
    network &&
    !hit(`track:network:${network}`, { limit: 240, windowMs: MINUTE }).ok
  ) {
    return noContent();
  }

  const rawVisitorId =
    req.cookies.get(ANALYTICS_VISITOR_COOKIE)?.value ?? null;
  const visitorId = isValidVisitorId(rawVisitorId) ? rawVisitorId : null;
  const proof =
    req.cookies.get(ANALYTICS_VISITOR_PROOF_COOKIE)?.value ?? null;
  let hasValidProof = false;
  try {
    hasValidProof = verifyVisitorProof(visitorId, proof);
  } catch {
    // A missing production secret is a deployment error, but analytics must
    // still fail closed and never take down the storefront.
    return noContent();
  }

  if (!visitorId || !hasValidProof) {
    // Unproven identities get much tighter aggregate limits. The incident used
    // hundreds of IPs but one browser fingerprint and a handful of /24s.
    if (
      network &&
      !hit(`track:new-network:${network}`, {
        limit: 12,
        windowMs: MINUTE,
      }).ok
    ) {
      return noContent();
    }

    const fingerprint = analyticsFingerprintKey([
      ua,
      g.country,
      req.headers.get("sec-ch-ua"),
      req.headers.get("sec-ch-ua-platform"),
    ]);
    if (
      !hit(`track:new-fingerprint:${fingerprint}`, {
        limit: 24,
        windowMs: MINUTE,
      }).ok
    ) {
      return noContent();
    }

    // Do not count this request. Plant (or migrate) the signed HttpOnly cookie,
    // then let VisitorTracker retry the exact beacon once.
    try {
      return seedVisitorCookies(visitorId ?? undefined);
    } catch {
      return noContent();
    }
  }

  if (
    !hit(`track:visitor:${visitorId}`, { limit: 60, windowMs: MINUTE }).ok
  ) {
    return noContent();
  }

  // Attribute the view to a user only if one is signed in.
  let userId: string | null = null;
  const hasSessionCookie = SESSION_COOKIES.some((name) =>
    req.cookies.has(name),
  );
  if (hasSessionCookie) {
    try {
      // Anonymous traffic is the common path. Lazy-loading auth keeps its
      // adapters and email stack out of the beacon's normal cold start.
      const { getSession } = await import("@/lib/auth");
      const session = await getSession(req.headers);
      userId = session?.user?.id ?? null;
    } catch {
      userId = null;
    }
  }

  await recordPageView({
    visitorId,
    userId,
    path,
    referrer,
    ip,
    country: g.country,
    region: g.region,
    city: g.city,
    latitude: g.latitude,
    longitude: g.longitude,
    timezone: g.timezone,
    userAgent: ua ?? null,
    device: parsed.device,
    browser: parsed.browser,
    os: parsed.os,
  });

  return noContent();
}

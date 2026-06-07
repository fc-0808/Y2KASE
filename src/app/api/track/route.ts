/**
 * POST /api/track — first-party visitor analytics beacon.
 *
 * The client (`<VisitorTracker />`) sends `{ path, referrer }` on each page
 * view. The server is the source of truth for everything sensitive/spoofable:
 * it derives the real client IP and approximate geolocation from the edge
 * headers Vercel injects, classifies the device from the User-Agent, and
 * stamps the event with a first-party visitor cookie used for unique counts.
 *
 * Returns 204 No Content. Analytics must never affect the user experience, so
 * every failure mode degrades silently.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { parseUserAgent, recordPageView } from "@/lib/analytics";
import { hit } from "@/lib/rate-limit";

/** First-party cookie holding the anonymous visitor id. */
const VISITOR_COOKIE = "y2k_vid";
const ONE_YEAR = 60 * 60 * 24 * 365;

// ---------------------------------------------------------------------------
// Known crawler IP prefixes (first two octets).
//
// Google's JavaScript Rendering Service sends a real Chrome User-Agent so it
// bypasses User-Agent-based bot detection. The only reliable signal is the
// source IP, which always falls within Google's published ASN ranges.
// Bing, Meta, and other major crawlers are listed for the same reason.
// Format: "A.B." matches any IP starting with that prefix.
// ---------------------------------------------------------------------------
const CRAWLER_IP_PREFIXES: readonly string[] = [
  // Google (Googlebot + Rendering Service + Ads + APIs)
  "66.249.", // Primary Googlebot range (most common)
  "64.233.",
  "66.102.",
  "72.14.",
  "74.125.",
  "209.85.",
  "216.58.",
  "216.239.",
  "35.191.", // Google Cloud / health checks
  "130.211.", // Google Cloud load balancer
  // Bing / Microsoft
  "40.77.",
  "157.55.",
  "207.46.",
  "65.52.",
  "199.30.",
  // Meta (Facebook crawler, Instagram)
  "66.220.",
  "69.63.",
  "69.171.",
  "173.252.",
  // Apple (Applebot)
  "17.0.",
  "17.172.",
  "17.253.",
];

/** Returns true if the IP belongs to a known crawler network. */
function isCrawlerIp(ip: string | null): boolean {
  if (!ip) return false;
  return CRAWLER_IP_PREFIXES.some((prefix) => ip.startsWith(prefix));
}

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

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  // Cap the beacon so a single source can't flood the analytics table. On limit
  // we drop silently (204) — analytics must never surface an error to the user.
  if (!hit(`track:${ip}`, { limit: 120, windowMs: 60_000 }).ok) {
    return new NextResponse(null, { status: 204 });
  }

  // Drop known crawler IPs before doing any further work. Google's JS renderer
  // uses a real Chrome UA and bypasses User-Agent detection, so IP is the only
  // reliable signal for these bots.
  if (isCrawlerIp(ip)) return new NextResponse(null, { status: 204 });

  let body: { path?: unknown; referrer?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const path =
    typeof body.path === "string" && body.path.startsWith("/")
      ? body.path.slice(0, 512)
      : null;
  if (!path) return new NextResponse(null, { status: 204 });

  // Never record the admin console or API calls in storefront analytics.
  if (path.startsWith("/admin") || path.startsWith("/api")) {
    return new NextResponse(null, { status: 204 });
  }

  const referrer =
    typeof body.referrer === "string" && body.referrer
      ? body.referrer.slice(0, 512)
      : null;

  const ua = req.headers.get("user-agent");
  const parsed = parseUserAgent(ua);

  // Skip bots identified by User-Agent (catches most non-JS crawlers).
  if (parsed.device === "bot") return new NextResponse(null, { status: 204 });

  // Resolve (or mint) the anonymous visitor id.
  let visitorId = req.cookies.get(VISITOR_COOKIE)?.value ?? null;
  const isNewVisitor = !visitorId;
  if (!visitorId) visitorId = crypto.randomUUID();

  // Attribute the view to a user only if one is signed in.
  let userId: string | null = null;
  try {
    const session = await getSession(req.headers);
    userId = session?.user?.id ?? null;
  } catch {
    userId = null;
  }

  const g = geo(req);

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

  const res = new NextResponse(null, { status: 204 });
  if (isNewVisitor) {
    res.cookies.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: ONE_YEAR,
      path: "/",
    });
  }
  return res;
}

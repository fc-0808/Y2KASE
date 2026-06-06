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

/** First-party cookie holding the anonymous visitor id. */
const VISITOR_COOKIE = "y2k_vid";
const ONE_YEAR = 60 * 60 * 24 * 365;

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

  // Skip bots entirely so the numbers reflect real humans.
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
    ip: clientIp(req),
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

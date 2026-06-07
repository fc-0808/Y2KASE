import {
  and,
  count,
  countDistinct,
  desc,
  gte,
  isNull,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { pageViews, type NewPageView } from "@/lib/db/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Internal-traffic geo exclusion
//
// Visits originating from these countries are predominantly the store owner and
// suppliers rather than real customers (customers are mostly US/EU). They are
// filtered out of every reporting query so the dashboard reflects genuine
// shopper traffic. Rows with an unknown country are kept (could be a real
// visitor whose geo simply wasn't resolved).
// ─────────────────────────────────────────────────────────────────────────────

const EXCLUDED_COUNTRIES = ["CN", "TW"] as const;

/** SQL predicate: keep rows whose country is not internal (or is unknown). */
const humanGeo = or(
  isNull(pageViews.country),
  notInArray(pageViews.country, EXCLUDED_COUNTRIES as unknown as string[]),
);

/** Combine the geo filter with an optional extra condition. */
function withHumanGeo(extra?: SQL): SQL {
  return (extra ? and(extra, humanGeo) : humanGeo) as SQL;
}

// ─────────────────────────────────────────────────────────────────────────────
// User-Agent parsing
//
// A tiny, dependency-free classifier. We don't need pixel-perfect detection —
// just enough to bucket traffic by device/browser/OS and to flag obvious bots
// so they don't pollute the human-visitor numbers.
// ─────────────────────────────────────────────────────────────────────────────

export type ParsedUA = {
  device: "mobile" | "tablet" | "desktop" | "bot";
  browser: string;
  os: string;
};

const BOT_RE =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora|pingdom|monitor|headless|lighthouse|gtmetrix|curl|wget|python-requests|axios|node-fetch|go-http/i;

export function parseUserAgent(ua: string | null | undefined): ParsedUA {
  const s = ua ?? "";
  if (!s || BOT_RE.test(s)) {
    return { device: "bot", browser: "Bot", os: "Bot" };
  }

  const isTablet = /ipad|tablet|(android(?!.*mobile))/i.test(s);
  const isMobile = /mobile|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(s);
  const device: ParsedUA["device"] = isTablet
    ? "tablet"
    : isMobile
      ? "mobile"
      : "desktop";

  let browser = "Unknown";
  if (/edg\//i.test(s)) browser = "Edge";
  else if (/opr\/|opera/i.test(s)) browser = "Opera";
  else if (/samsungbrowser/i.test(s)) browser = "Samsung Internet";
  else if (/chrome|crios/i.test(s)) browser = "Chrome";
  else if (/firefox|fxios/i.test(s)) browser = "Firefox";
  else if (/safari/i.test(s)) browser = "Safari";

  let os = "Unknown";
  if (/windows nt/i.test(s)) os = "Windows";
  else if (/iphone|ipad|ipod/i.test(s)) os = "iOS";
  else if (/mac os x/i.test(s)) os = "macOS";
  else if (/android/i.test(s)) os = "Android";
  else if (/linux/i.test(s)) os = "Linux";

  return { device, browser, os };
}

// ─────────────────────────────────────────────────────────────────────────────
// Recording
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a single page view. Best-effort: analytics must never break a page,
 * so callers should not await this in the critical path and we swallow errors.
 */
export async function recordPageView(input: NewPageView): Promise<void> {
  if (!isDbConfigured()) return;
  try {
    await db.insert(pageViews).values(input);
  } catch (err) {
    console.error(
      "[analytics] failed to record page view:",
      err instanceof Error ? err.message : err,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reporting (admin)
// ─────────────────────────────────────────────────────────────────────────────

export type VisitorOverview = {
  totalViews: number;
  uniqueVisitors: number;
  viewsToday: number;
  uniqueToday: number;
  views7d: number;
  unique7d: number;
};

export type RecentVisit = {
  id: number;
  path: string;
  referrer: string | null;
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  createdAt: Date;
};

export type CountRow = { label: string; value: number };
export type DailyPoint = { date: string; views: number; uniques: number };

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const EMPTY_OVERVIEW: VisitorOverview = {
  totalViews: 0,
  uniqueVisitors: 0,
  viewsToday: 0,
  uniqueToday: 0,
  views7d: 0,
  unique7d: 0,
};

export async function getVisitorOverview(): Promise<VisitorOverview> {
  if (!isDbConfigured()) return EMPTY_OVERVIEW;

  const today = startOfToday();
  const weekAgo = daysAgo(7);

  const [[all], [todayRow], [weekRow]] = await Promise.all([
    db
      .select({
        views: count(),
        uniques: countDistinct(pageViews.visitorId),
      })
      .from(pageViews)
      .where(withHumanGeo()),
    db
      .select({
        views: count(),
        uniques: countDistinct(pageViews.visitorId),
      })
      .from(pageViews)
      .where(withHumanGeo(gte(pageViews.createdAt, today))),
    db
      .select({
        views: count(),
        uniques: countDistinct(pageViews.visitorId),
      })
      .from(pageViews)
      .where(withHumanGeo(gte(pageViews.createdAt, weekAgo))),
  ]);

  return {
    totalViews: all?.views ?? 0,
    uniqueVisitors: all?.uniques ?? 0,
    viewsToday: todayRow?.views ?? 0,
    uniqueToday: todayRow?.uniques ?? 0,
    views7d: weekRow?.views ?? 0,
    unique7d: weekRow?.uniques ?? 0,
  };
}

export async function getRecentVisits(limit = 100): Promise<RecentVisit[]> {
  if (!isDbConfigured()) return [];
  return db
    .select({
      id: pageViews.id,
      path: pageViews.path,
      referrer: pageViews.referrer,
      ip: pageViews.ip,
      country: pageViews.country,
      region: pageViews.region,
      city: pageViews.city,
      device: pageViews.device,
      browser: pageViews.browser,
      os: pageViews.os,
      createdAt: pageViews.createdAt,
    })
    .from(pageViews)
    .where(withHumanGeo())
    .orderBy(desc(pageViews.createdAt))
    .limit(limit);
}

export async function getTopPages(limit = 8): Promise<CountRow[]> {
  if (!isDbConfigured()) return [];
  const rows = await db
    .select({ label: pageViews.path, value: count() })
    .from(pageViews)
    .where(withHumanGeo(gte(pageViews.createdAt, daysAgo(30))))
    .groupBy(pageViews.path)
    .orderBy(desc(count()))
    .limit(limit);
  return rows.map((r) => ({ label: r.label, value: r.value }));
}

export async function getTopCountries(limit = 8): Promise<CountRow[]> {
  if (!isDbConfigured()) return [];
  const rows = await db
    .select({ label: pageViews.country, value: count() })
    .from(pageViews)
    .where(
      withHumanGeo(
        and(
          gte(pageViews.createdAt, daysAgo(30)),
          sql`${pageViews.country} is not null`,
        ),
      ),
    )
    .groupBy(pageViews.country)
    .orderBy(desc(count()))
    .limit(limit);
  return rows.map((r) => ({ label: r.label ?? "Unknown", value: r.value }));
}

export async function getDeviceBreakdown(): Promise<CountRow[]> {
  if (!isDbConfigured()) return [];
  const rows = await db
    .select({ label: pageViews.device, value: count() })
    .from(pageViews)
    .where(withHumanGeo(gte(pageViews.createdAt, daysAgo(30))))
    .groupBy(pageViews.device)
    .orderBy(desc(count()));
  return rows.map((r) => ({ label: r.label ?? "Unknown", value: r.value }));
}

/** Daily views + uniques for the last `days` days, oldest → newest. */
export async function getDailyViews(days = 14): Promise<DailyPoint[]> {
  if (!isDbConfigured()) return [];
  const since = daysAgo(days);
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${pageViews.createdAt}), 'YYYY-MM-DD')`,
      views: count(),
      uniques: countDistinct(pageViews.visitorId),
    })
    .from(pageViews)
    .where(withHumanGeo(gte(pageViews.createdAt, since)))
    .groupBy(sql`date_trunc('day', ${pageViews.createdAt})`)
    .orderBy(sql`date_trunc('day', ${pageViews.createdAt})`);

  // Fill gaps so the chart has a continuous axis.
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = daysAgo(i);
    const key = d.toISOString().slice(0, 10);
    const hit = byDay.get(key);
    out.push({
      date: key,
      views: hit?.views ?? 0,
      uniques: hit?.uniques ?? 0,
    });
  }
  return out;
}

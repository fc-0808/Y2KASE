import type { Metadata } from "next";
import Link from "next/link";
import { Globe, Users, Eye, CalendarDays } from "lucide-react";
import { isDbConfigured } from "@/lib/db";
import {
  getVisitorOverview,
  getRecentVisits,
  getDailyTrafficReading,
  getTopPages,
  getTopCountries,
  getDeviceBreakdown,
  getViewsTrend,
  chromeMajorVersion,
  TREND_RANGES,
  type RecentVisit,
  type TrendRangeKey,
} from "@/lib/analytics";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { describeVisitSource, stripeSessionId } from "@/lib/analytics/referrer";
import { reviewVisitors } from "@/lib/analytics/visitor-review";
import { cn } from "@/lib/utils";
import { VisitList, type VisitCard } from "./visit-list";

export const metadata: Metadata = { title: "Admin · Visitors" };
export const dynamic = "force-dynamic";

const timeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Hong_Kong",
});

const dayFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "Asia/Hong_Kong",
});

function formatReadingDay(isoDay: string): string {
  return dayFmt.format(new Date(`${isoDay}T12:00:00+08:00`));
}

/** Turn a 2-letter ISO country code into its flag emoji. */
function flag(code: string | null): string {
  if (!code || code.length !== 2) return "🌐";
  const A = 0x1f1e6;
  const up = code.toUpperCase();
  return String.fromCodePoint(
    A + (up.charCodeAt(0) - 65),
    A + (up.charCodeAt(1) - 65),
  );
}

export default async function AdminVisitorsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  if (!isDbConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Database not configured</h1>
      </div>
    );
  }

  const { range: rangeParam } = await searchParams;
  const range: TrendRangeKey = TREND_RANGES.some((r) => r.key === rangeParam)
    ? (rangeParam as TrendRangeKey)
    : "14d";
  const rangeLabel =
    TREND_RANGES.find((r) => r.key === range)?.label ?? "14 days";

  const [overview, trend, reading, topPages, topCountries, devices, recent] =
    await Promise.all([
      getVisitorOverview(),
      getViewsTrend(range),
      getDailyTrafficReading(10),
      getTopPages(8),
      getTopCountries(8),
      getDeviceBreakdown(),
      getRecentVisits(100),
    ]);
  const sessionIds = [
    ...new Set(
      recent
        .map((visit) => stripeSessionId(visit.landingQuery))
        .filter((id): id is string => id != null),
    ),
  ];
  const matchedOrders = sessionIds.length
    ? await db
        .select({
          stripeSessionId: orders.stripeSessionId,
          orderNumber: orders.orderNumber,
          status: orders.status,
        })
        .from(orders)
        .where(inArray(orders.stripeSessionId, sessionIds))
    : [];
  const orderBySession = new Map(
    matchedOrders.flatMap((order) =>
      order.stripeSessionId
        ? [[order.stripeSessionId, `${order.orderNumber} · ${order.status}`] as const]
        : [],
    ),
  );
  const todayReading = reading[0];

  const kpis = [
    { label: "Unique visitors", value: overview.uniqueVisitors, icon: Users, accent: "text-fuchsia-600" },
    { label: "Total views", value: overview.totalViews, icon: Eye, accent: "text-pink-600" },
    { label: "Visitors today", value: overview.uniqueToday, icon: CalendarDays, accent: "text-amber-600" },
    { label: "Views (7d)", value: overview.views7d, icon: Globe, accent: "text-sky-600" },
  ];

  const maxUniques = Math.max(1, ...trend.map((d) => d.uniques));
  const totalDevices = Math.max(1, devices.reduce((s, d) => s + d.value, 0));
  // Tight gap for long ranges so up to 90 bars always fit the card width.
  const barGap = trend.length > 60 ? 1 : trend.length > 31 ? 2 : trend.length > 14 ? 3 : 6;
  // ~5 evenly-spaced axis ticks (avoids label crowding/overflow on any range).
  const n = trend.length;
  const tickIdx =
    n <= 8
      ? trend.map((_, i) => i)
      : [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-black sm:text-3xl">Visitors</h1>
        <p className="mt-1 max-w-prose text-sm text-[var(--foreground)]/60 text-pretty">
          Traffic, geography, and devices. The daily reading separates the
          catalog crawler from everyone else.
        </p>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon, accent }) => (
          <div
            key={label}
            className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--foreground)]/50">
                {label}
              </p>
              <Icon className={cn("h-4 w-4", accent)} />
            </div>
            <p className={cn("mt-2 text-2xl font-black", accent)}>{value}</p>
          </div>
        ))}
      </div>

      <section className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-bold">Daily reading</h2>
          <p className="text-xs text-[var(--foreground)]/50">
            Hong Kong time · newest first
          </p>
        </div>
        <p className="mt-1 max-w-prose text-sm text-[var(--foreground)]/60 text-pretty">
          Catalog crawler means desktop Chrome 148, 149, or 150. Everyone else
          is the rest of the day.
        </p>
        {todayReading ? (
          <div className="mt-4 grid grid-cols-3 gap-2">
            <ReadingStat label="Today" value={todayReading.visitors} />
            <ReadingStat
              label="Crawler"
              value={todayReading.catalogCrawler}
              tone="amber"
            />
            <ReadingStat
              label="Everyone else"
              value={todayReading.everyoneElse}
              tone="emerald"
            />
          </div>
        ) : null}
        <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] gap-2 bg-[var(--muted)]/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--foreground)]/50 sm:grid">
            <span>Day</span>
            <span className="text-right">Visitors</span>
            <span className="text-right">Crawler</span>
            <span className="text-right">Everyone else</span>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {reading.map((row, index) => (
              <li key={row.day}>
                <div className="px-3 py-3 sm:hidden">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{formatReadingDay(row.day)}</span>
                    {index === 0 ? <TodayMark /> : null}
                  </div>
                  <p className="mt-1 text-xs tabular-nums text-[var(--foreground)]/65">
                    {row.visitors} visitors · {row.catalogCrawler} crawler ·{" "}
                    {row.everyoneElse} everyone else
                  </p>
                </div>
                <div
                  className={cn(
                    "hidden grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] items-center gap-2 px-3 py-2.5 text-sm sm:grid",
                    index === 0 && "bg-[var(--muted)]/40",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2 font-semibold">
                    {formatReadingDay(row.day)}
                    {index === 0 ? <TodayMark /> : null}
                  </span>
                  <span className="text-right tabular-nums">{row.visitors}</span>
                  <span className="text-right tabular-nums text-amber-800">
                    {row.catalogCrawler}
                  </span>
                  <span className="text-right tabular-nums">
                    {row.everyoneElse}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Unique-visitors trend with range selector */}
      <section className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">Unique visitors</h2>
            <p className="text-xs text-[var(--foreground)]/50">Last {rangeLabel}</p>
          </div>
          <nav className="flex flex-wrap gap-1 rounded-full bg-[var(--muted)]/60 p-1">
            {TREND_RANGES.map((r) => {
              const active = r.key === range;
              return (
                <Link
                  key={r.key}
                  href={`/admin/visitors?range=${r.key}`}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-bold transition",
                    active
                      ? "bg-[var(--primary)] text-white shadow-sm"
                      : "text-[var(--foreground)]/60 hover:text-[var(--primary)]",
                  )}
                >
                  {r.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {overview.totalViews === 0 ? (
          <EmptyHint />
        ) : (
          <>
            <div className="flex h-40 items-end" style={{ gap: `${barGap}px` }}>
              {trend.map((d) => (
                <div
                  key={d.key}
                  className="group relative flex h-full min-w-0 flex-1 items-end"
                  title={`${d.full}: ${d.uniques} unique · ${d.views} views`}
                >
                  {/* Value label — floats above the bar, only on hover, so it
                      never steals height from the bar itself. */}
                  <span className="pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-[var(--foreground)]/0 group-hover:text-[var(--foreground)]/70">
                    {d.uniques}
                  </span>
                  <div
                    className="w-full rounded-t-md bg-[var(--primary)]/80 transition group-hover:bg-[var(--primary)]"
                    style={{
                      height: `${(d.uniques / maxUniques) * 100}%`,
                      minHeight: d.uniques > 0 ? 4 : 0,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[9px] text-[var(--foreground)]/40">
              {tickIdx.map((i) => (
                <span key={i}>{trend[i]?.short}</span>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Breakdown grids */}
      <div className="mb-6 grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <BreakdownCard title="Top pages">
          {topPages.length === 0 ? (
            <EmptyHint small />
          ) : (
            <BarList
              rows={topPages.map((p) => ({ label: p.label, value: p.value }))}
              mono
            />
          )}
        </BreakdownCard>

        <BreakdownCard title="Top countries">
          {topCountries.length === 0 ? (
            <EmptyHint small />
          ) : (
            <ul className="space-y-2">
              {topCountries.map((c) => (
                <li key={c.label} className="flex items-center gap-2 text-sm">
                  <span className="shrink-0 text-base">{flag(c.label)}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {c.label}
                  </span>
                  <span className="shrink-0 text-[var(--foreground)]/60">
                    {c.value}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </BreakdownCard>

        <BreakdownCard title="Devices">
          {devices.length === 0 ? (
            <EmptyHint small />
          ) : (
            <ul className="space-y-3">
              {devices.map((d) => (
                <li key={d.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold capitalize">{d.label}</span>
                    <span className="text-[var(--foreground)]/60">
                      {Math.round((d.value / totalDevices) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--muted)]">
                    <div
                      className="h-full rounded-full bg-[var(--primary)]"
                      style={{ width: `${(d.value / totalDevices) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </BreakdownCard>
      </div>

      {/* Recent visits */}
      <section className="rounded-2xl border border-[var(--border)]">
        <header className="border-b border-[var(--border)] px-4 py-3 sm:px-5">
          <h2 className="font-bold">Recent visits</h2>
          <p className="mt-0.5 text-xs text-[var(--foreground)]/50 md:hidden">
            Tap a visit to open its client hints and the rest of the stored
            fields.
          </p>
          <p className="mt-0.5 hidden text-xs text-[var(--foreground)]/50 md:block">
            Every stored field. Client hints, language, and JA4 come from the
            browser. Fetch metadata is the page load: none is a typed address,
            cross-site is another site. A click inside the shop has no new page
            load, so those four stay blank. Visits from before this change
            leave the new fields blank.
          </p>
        </header>
        {recent.length === 0 ? (
          <div className="p-8">
            <EmptyHint />
          </div>
        ) : (
          <VisitList visits={reviewCards(recent, orderBySession)} />
        )}
      </section>
    </div>
  );
}

function TodayMark() {
  return (
    <span className="rounded-full bg-[var(--primary)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--primary)]">
      Today
    </span>
  );
}

function ReadingStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "amber" | "emerald";
}) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 px-3 py-2.5">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-[var(--foreground)]/45">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-xl font-black tabular-nums",
          tone === "amber" && "text-amber-800",
          tone === "emerald" && "text-emerald-800",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function reviewCards(
  visits: RecentVisit[],
  orderBySession: Map<string, string>,
): VisitCard[] {
  const verdicts = new Map(reviewVisitors(visits).map((verdict) => [verdict.id, verdict]));
  return visits.map((visit) =>
    visitCard(visit, verdicts.get(visit.id), orderBySession),
  );
}

function visitCard(
  visit: RecentVisit,
  verdict: { crawler: boolean; reasons: string[] } | undefined,
  orderBySession: Map<string, string>,
): VisitCard {
  const version = chromeMajorVersion(visit.userAgent);
  const place =
    [flag(visit.country), visit.city, visit.region, visit.country]
      .filter(Boolean)
      .join(" ") || "Unknown";
  const browser = visit.browser
    ? version
      ? `${visit.browser} ${version}`
      : visit.browser
    : null;
  return {
    id: visit.id,
    path: visit.path,
    time: timeFmt.format(new Date(visit.createdAt)),
    crawler: verdict?.crawler ?? false,
    reasons: verdict?.reasons ?? [],
    summary: [place, visit.device ? capitalize(visit.device) : null, browser]
      .filter(Boolean)
      .join(" · "),
    fields: visitFields(
      visit,
      orderBySession.get(stripeSessionId(visit.landingQuery) ?? "") ?? null,
    ),
  };
}

function checkoutNote(visit: RecentVisit, orderLabel: string | null): string | null {
  if (!visit.path.startsWith("/checkout/success")) return null;
  if (orderLabel) {
    return `${orderLabel}. Opening this receipt does not create another order.`;
  }
  if ((visit.referrer ?? "").includes("checkout.stripe.com")) {
    return "Came back from Stripe. This is the receipt page. The order list is where payment shows up.";
  }
  return "Reopened an old receipt. Not a new checkout, so no new order is expected.";
}

function visitFields(visit: RecentVisit, orderLabel: string | null): {
  label: string;
  value: string;
  mono?: boolean;
  wide?: boolean;
}[] {
  const source = describeVisitSource(visit.referrer, visit.landingQuery);
  const version = chromeMajorVersion(visit.userAgent);
  const coordinates =
    visit.latitude && visit.longitude
      ? `${visit.latitude}, ${visit.longitude}`
      : "—";
  const checkout = checkoutNote(visit, orderLabel);
  return [
    ...(checkout
      ? [{ label: "Checkout", value: checkout, wide: true as const }]
      : []),
    { label: "Visitor id", value: visit.visitorId, mono: true, wide: true },
    { label: "Logged-in user", value: visit.userId ?? "—", mono: true, wide: true },
    {
      label: "Location",
      value:
        [flag(visit.country), visit.city, visit.region, visit.country]
          .filter(Boolean)
          .join(" ") || "Unknown",
    },
    { label: "Coordinates", value: coordinates, mono: true },
    { label: "Timezone", value: visit.timezone ?? "—" },
    { label: "IP address", value: visit.ip ?? "—", mono: true },
    {
      label: "Device",
      value: visit.device ? capitalize(visit.device) : "—",
    },
    {
      label: "Browser",
      value: visit.browser
        ? version
          ? `${visit.browser} ${version}`
          : visit.browser
        : "—",
    },
    { label: "Operating system", value: visit.os ?? "—" },
    { label: "Source", value: source.detail ? `${source.source} · ${source.detail}` : source.source },
    { label: "Referrer", value: visit.referrer ?? "—", mono: true, wide: true },
    {
      label: "Landing query",
      value: visit.landingQuery ?? "—",
      mono: true,
      wide: true,
    },
    { label: "User agent", value: visit.userAgent ?? "—", mono: true, wide: true },
    { label: "sec-ch-ua", value: visit.secChUa ?? "—", mono: true, wide: true },
    { label: "sec-ch-ua-mobile", value: visit.secChUaMobile ?? "—" },
    { label: "sec-ch-ua-platform", value: platformValue(visit) },
    {
      label: "sec-ch-ua-full-version-list",
      value: visit.secChUaFullVersionList ?? "—",
      mono: true,
      wide: true,
    },
    { label: "sec-ch-ua-platform-version", value: visit.secChUaPlatformVersion ?? "—" },
    { label: "sec-ch-ua-arch", value: visit.secChUaArch ?? "—" },
    { label: "sec-ch-ua-model", value: visit.secChUaModel ?? "—" },
    { label: "sec-ch-ua-bitness", value: visit.secChUaBitness ?? "—" },
    { label: "Sec-Fetch-Site", value: fetchSiteValue(visit) },
    { label: "Sec-Fetch-Mode", value: visit.secFetchMode ?? "—" },
    { label: "Sec-Fetch-Dest", value: visit.secFetchDest ?? "—" },
    { label: "Sec-Fetch-User", value: visit.secFetchUser ?? "—" },
    { label: "Accept-Language", value: visit.acceptLanguage ?? "—", wide: true },
    { label: "JA4", value: visit.ja4Digest ?? "—", mono: true, wide: true },
    {
      label: "Previous page from this visitor",
      value: previousPageGap(visit),
      wide: true,
    },
  ];
}

function platformValue(visit: RecentVisit): string {
  const platform = visit.secChUaPlatform;
  if (!platform) return "—";
  const ua = visit.userAgent ?? "";
  const hint = platform.toLowerCase();
  const windows = /windows/i.test(ua);
  const mac = /macintosh|mac os x/i.test(ua);
  const android = /android/i.test(ua);
  const disagrees =
    (windows && !hint.includes("windows")) ||
    (mac && !hint.includes("mac")) ||
    (android && !hint.includes("android"));
  return disagrees ? `${platform} · disagrees with the user agent` : platform;
}

function fetchSiteValue(visit: RecentVisit): string {
  const site = visit.secFetchSite;
  if (!site) return "—";
  const referrer = visit.referrer ?? "";
  if (
    site === "none" &&
    /google\.|bing\.|duckduckgo\.|yahoo\./i.test(referrer)
  ) {
    return `${site} · disagrees with the referrer`;
  }
  return site;
}

function previousPageGap(visit: RecentVisit): string {
  if (!visit.previousAt) return "First page from this visitor";
  const previous = new Date(visit.previousAt);
  if (Number.isNaN(previous.getTime())) return "First page from this visitor";
  const seconds = Math.max(
    0,
    Math.round((new Date(visit.createdAt).getTime() - previous.getTime()) / 1000),
  );
  const when = timeFmt.format(previous);
  if (seconds < 60) return `${seconds}s after the previous page · ${when}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m after the previous page · ${when}`;
  const hours = Math.round(minutes / 60);
  return `${hours}h after the previous page · ${when}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function BreakdownCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <h2 className="mb-4 font-bold">{title}</h2>
      {children}
    </div>
  );
}

function BarList({
  rows,
  mono,
}: {
  rows: { label: string; value: number }[];
  mono?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="relative">
          <div
            className="absolute inset-y-0 left-0 rounded-md bg-[var(--primary)]/10"
            style={{ width: `${(r.value / max) * 100}%` }}
          />
          <div className="relative flex items-center justify-between gap-2 px-2 py-1 text-sm">
            <span className={cn("min-w-0 truncate", mono && "font-mono text-xs")}>
              {r.label}
            </span>
            <span className="shrink-0 font-semibold text-[var(--foreground)]/70">
              {r.value}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyHint({ small }: { small?: boolean }) {
  return (
    <p
      className={cn(
        "text-center text-[var(--foreground)]/50",
        small ? "py-6 text-sm" : "py-10",
      )}
    >
      No visitor data yet. Once the storefront gets traffic, it&apos;ll appear
      here.
    </p>
  );
}

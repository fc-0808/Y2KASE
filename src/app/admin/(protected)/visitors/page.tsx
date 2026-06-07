import type { Metadata } from "next";
import Link from "next/link";
import { Globe, Users, Eye, CalendarDays } from "lucide-react";
import { isDbConfigured } from "@/lib/db";
import {
  getVisitorOverview,
  getRecentVisits,
  getTopPages,
  getTopCountries,
  getDeviceBreakdown,
  getViewsTrend,
  TREND_RANGES,
  type TrendRangeKey,
} from "@/lib/analytics";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin · Visitors" };
export const dynamic = "force-dynamic";

const timeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

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

  const [overview, trend, topPages, topCountries, devices, recent] =
    await Promise.all([
      getVisitorOverview(),
      getViewsTrend(range),
      getTopPages(8),
      getTopCountries(8),
      getDeviceBreakdown(),
      getRecentVisits(100),
    ]);

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
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-3xl font-black">Visitors</h1>
        <p className="mt-1 text-sm text-[var(--foreground)]/60">
          First-party, privacy-conscious analytics — traffic, geography and
          devices. Bots are filtered out so these are real humans.
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
                  className="group flex min-w-0 flex-1 flex-col items-center justify-end"
                  title={`${d.full}: ${d.uniques} unique · ${d.views} views`}
                >
                  <span className="mb-1 text-[10px] font-semibold text-[var(--foreground)]/0 group-hover:text-[var(--foreground)]/70">
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
        <header className="border-b border-[var(--border)] px-5 py-3">
          <h2 className="font-bold">Recent visits</h2>
        </header>
        {recent.length === 0 ? (
          <div className="p-8">
            <EmptyHint />
          </div>
        ) : (
          <>
            {/* Mobile: stacked cards (the table doesn't fit a phone screen). */}
            <ul className="divide-y divide-[var(--border)] md:hidden">
              {recent.map((v) => (
                <li key={v.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-mono text-xs font-semibold">
                      {v.path}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--foreground)]/50">
                      {timeFmt.format(new Date(v.createdAt))}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--foreground)]/60">
                    <span>
                      <span className="mr-1">{flag(v.country)}</span>
                      {[v.city, v.region, v.country]
                        .filter(Boolean)
                        .join(", ") || "Unknown"}
                    </span>
                    <span aria-hidden>·</span>
                    <span className="capitalize">
                      {v.device ?? "—"}
                      {v.browser ? ` · ${v.browser}` : ""}
                    </span>
                  </div>
                  <div className="mt-1 flex w-full items-center gap-x-2 text-[11px] text-[var(--foreground)]/40">
                    <span className="shrink-0 font-mono">{v.ip ?? "—"}</span>
                    <span aria-hidden>·</span>
                    <span className="min-w-0 flex-1 truncate">
                      {v.referrer ?? "Direct"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop: full table. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-[var(--muted)]/50 text-left text-xs uppercase tracking-wide text-[var(--foreground)]/50">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Time</th>
                    <th className="px-4 py-3 font-semibold">Page</th>
                    <th className="px-4 py-3 font-semibold">Location</th>
                    <th className="px-4 py-3 font-semibold">IP</th>
                    <th className="px-4 py-3 font-semibold">Device</th>
                    <th className="px-4 py-3 font-semibold">Referrer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {recent.map((v) => (
                    <tr key={v.id} className="hover:bg-[var(--muted)]/30">
                      <td className="whitespace-nowrap px-4 py-2.5 text-[var(--foreground)]/60">
                        {timeFmt.format(new Date(v.createdAt))}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-2.5 font-mono text-xs">
                        {v.path}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className="mr-1">{flag(v.country)}</span>
                        {[v.city, v.region, v.country]
                          .filter(Boolean)
                          .join(", ") || "Unknown"}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-[var(--foreground)]/60">
                        {v.ip ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-[var(--foreground)]/70">
                        <span className="capitalize">{v.device ?? "—"}</span>
                        {v.browser && (
                          <span className="text-[var(--foreground)]/40">
                            {" "}
                            · {v.browser}
                          </span>
                        )}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-xs text-[var(--foreground)]/50">
                        {v.referrer ?? "Direct"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
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

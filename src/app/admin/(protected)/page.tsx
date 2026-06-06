import type { Metadata } from "next";
import Link from "next/link";
import {
  Package,
  FolderTree,
  ShoppingBag,
  Users,
  Mail,
  Globe,
  UploadCloud,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { isDbConfigured } from "@/lib/db";
import { getOrderStats, getOrders } from "@/lib/admin/orders";
import { getMemberStats } from "@/lib/admin/members";
import { getSubscriberStats } from "@/lib/admin/subscribers";
import { getVisitorOverview, getRecentVisits } from "@/lib/analytics";
import { formatCents, cn } from "@/lib/utils";
import { StatusBadge } from "@/components/admin/StatusBadge";

export const metadata: Metadata = { title: "Admin · Dashboard" };
export const dynamic = "force-dynamic";

const SECTIONS = [
  { href: "/admin/products", label: "Products", desc: "Catalog & variations", icon: Package },
  { href: "/admin/collections", label: "Collections", desc: "Browse taxonomy", icon: FolderTree },
  { href: "/admin/orders", label: "Orders", desc: "Fulfillment & revenue", icon: ShoppingBag },
  { href: "/admin/members", label: "Members", desc: "Customers & roles", icon: Users },
  { href: "/admin/subscribers", label: "Subscribers", desc: "Email marketing list", icon: Mail },
  { href: "/admin/visitors", label: "Visitors", desc: "Traffic & geography", icon: Globe },
  { href: "/admin/upload", label: "Upload", desc: "Add product media", icon: UploadCloud },
] as const;

export default async function AdminDashboardPage() {
  if (!isDbConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Database not configured</h1>
        <p className="mt-2 text-[var(--foreground)]/60">
          Add <code>DATABASE_URL</code> to <code>.env.local</code> to use the
          admin panel.
        </p>
      </div>
    );
  }

  const [orderStats, memberStats, subStats, visitors, recentOrders, recentVisits] =
    await Promise.all([
      getOrderStats(),
      getMemberStats(),
      getSubscriberStats(),
      getVisitorOverview(),
      getOrders().then((o) => o.slice(0, 6)),
      getRecentVisits(6),
    ]);

  const stats = [
    {
      label: "Revenue (7d)",
      value: formatCents(orderStats.revenue7dCents),
      sub: `${formatCents(orderStats.revenueCents)} all-time`,
      href: "/admin/orders",
      accent: "text-emerald-600",
    },
    {
      label: "Orders",
      value: String(orderStats.total),
      sub: `${orderStats.pending} pending · ${orderStats.paid} paid`,
      href: "/admin/orders",
      accent: "text-pink-600",
    },
    {
      label: "Members",
      value: String(memberStats.total),
      sub: `+${memberStats.newThisWeek} this week`,
      href: "/admin/members",
      accent: "text-fuchsia-600",
    },
    {
      label: "Subscribers",
      value: String(subStats.active),
      sub: `${subStats.total} total`,
      href: "/admin/subscribers",
      accent: "text-sky-600",
    },
    {
      label: "Visitors today",
      value: String(visitors.uniqueToday),
      sub: `${visitors.viewsToday} views today`,
      href: "/admin/visitors",
      accent: "text-amber-600",
    },
    {
      label: "Unique visitors",
      value: String(visitors.uniqueVisitors),
      sub: `${visitors.totalViews} total views`,
      href: "/admin/visitors",
      accent: "text-violet-600",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-black">Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--foreground)]/60">
          A live overview of your store — revenue, orders, members and traffic.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--primary)] hover:shadow-md"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--foreground)]/50">
              {s.label}
            </p>
            <p className={cn("mt-2 text-2xl font-black", s.accent)}>{s.value}</p>
            <p className="mt-1 text-xs text-[var(--foreground)]/50">{s.sub}</p>
          </Link>
        ))}
      </div>

      {/* Recent activity */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
            <h2 className="flex items-center gap-2 font-bold">
              <ShoppingBag className="h-4 w-4" /> Recent orders
            </h2>
            <Link
              href="/admin/orders"
              className="flex items-center gap-1 text-sm font-semibold text-[var(--primary)] hover:underline"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </header>
          {recentOrders.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-[var(--foreground)]/50">
              No orders yet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {recentOrders.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--muted)]/40"
                  >
                    <span className="font-mono text-sm font-bold">#{o.id}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-[var(--foreground)]/70">
                      {o.email}
                    </span>
                    <StatusBadge status={o.status} />
                    <span className="text-sm font-bold">
                      {formatCents(o.totalCents, o.currency)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
            <h2 className="flex items-center gap-2 font-bold">
              <TrendingUp className="h-4 w-4" /> Recent visitors
            </h2>
            <Link
              href="/admin/visitors"
              className="flex items-center gap-1 text-sm font-semibold text-[var(--primary)] hover:underline"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </header>
          {recentVisits.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-[var(--foreground)]/50">
              No visits recorded yet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {recentVisits.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center gap-3 px-5 py-3 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-[var(--foreground)]/70">
                    {v.path}
                  </span>
                  <span className="text-[var(--foreground)]/50">
                    {[v.city, v.country].filter(Boolean).join(", ") || "—"}
                  </span>
                  <span className="text-xs text-[var(--foreground)]/40">
                    {timeAgo(v.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Section shortcuts */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--foreground)]/50">
          Manage
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {SECTIONS.map(({ href, label, desc, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--primary)] hover:shadow-md"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--muted)] text-[var(--primary)] group-hover:bg-[var(--primary)] group-hover:text-white">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-bold">{label}</p>
                <p className="truncate text-xs text-[var(--foreground)]/50">
                  {desc}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

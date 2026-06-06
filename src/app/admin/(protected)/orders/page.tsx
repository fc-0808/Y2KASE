import type { Metadata } from "next";
import Link from "next/link";
import { isDbConfigured } from "@/lib/db";
import { getOrders, getOrderStats, ORDER_STATUSES } from "@/lib/admin/orders";
import { formatCents, cn } from "@/lib/utils";
import { OrdersConsole } from "./OrdersConsole";

export const metadata: Metadata = { title: "Admin · Orders" };
export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  if (!isDbConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Database not configured</h1>
      </div>
    );
  }

  const sp = await searchParams;
  const activeStatus =
    sp.status && (ORDER_STATUSES as readonly string[]).includes(sp.status)
      ? sp.status
      : undefined;

  const [orders, stats] = await Promise.all([
    getOrders(activeStatus),
    getOrderStats(),
  ]);

  const tabs = [
    { key: undefined, label: "All", count: stats.total },
    ...ORDER_STATUSES.map((s) => ({ key: s, label: s, count: undefined })),
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Orders</h1>
          <p className="mt-1 text-sm text-[var(--foreground)]/60">
            {formatCents(stats.revenueCents)} lifetime revenue ·{" "}
            {formatCents(stats.revenue7dCents)} in the last 7 days.
          </p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const isActive = activeStatus === t.key;
          return (
            <Link
              key={t.label}
              href={t.key ? `/admin/orders?status=${t.key}` : "/admin/orders"}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-semibold capitalize transition",
                isActive
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--muted)] text-[var(--foreground)]/70 hover:bg-[var(--border)]",
              )}
            >
              {t.label}
              {t.count != null && (
                <span className="ml-1.5 opacity-70">{t.count}</span>
              )}
            </Link>
          );
        })}
      </div>

      {orders.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--card)] p-12 text-center">
          <p className="text-4xl">📦</p>
          <p className="mt-3 text-lg font-bold">No orders here yet</p>
          <p className="mt-1 text-sm text-[var(--foreground)]/60">
            Orders appear automatically once customers check out via Stripe.
          </p>
        </div>
      ) : (
        <OrdersConsole orders={orders} />
      )}
    </div>
  );
}

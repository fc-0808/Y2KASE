import type { Metadata } from "next";
import { isDbConfigured } from "@/lib/db";
import { getSubscribers, getSubscriberStats } from "@/lib/admin/subscribers";
import { SubscribersConsole } from "./SubscribersConsole";

export const metadata: Metadata = { title: "Admin · Subscribers" };
export const dynamic = "force-dynamic";

export default async function AdminSubscribersPage() {
  if (!isDbConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Database not configured</h1>
      </div>
    );
  }

  const [subscribers, stats] = await Promise.all([
    getSubscribers(),
    getSubscriberStats(),
  ]);

  const cards = [
    { label: "Active", value: stats.active },
    { label: "Unsubscribed", value: stats.unsubscribed },
    { label: "Total", value: stats.total },
    { label: "New this week", value: stats.newThisWeek },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-3xl font-black">Subscribers</h1>
        <p className="mt-1 text-sm text-[var(--foreground)]/60">
          Your marketing email list, captured from the welcome pop-up, footer
          and checkout. Export to CSV for your email platform.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--foreground)]/50">
              {c.label}
            </p>
            <p className="mt-1 text-2xl font-black">{c.value}</p>
          </div>
        ))}
      </div>

      <SubscribersConsole subscribers={subscribers} />
    </div>
  );
}

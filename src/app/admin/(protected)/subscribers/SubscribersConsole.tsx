"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Download, Loader2, UserX, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/admin/StatusBadge";
import type { EmailSubscriber } from "@/lib/db/schema";
import { setSubscriberStatus } from "./actions";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function SubscribersConsole({
  subscribers,
}: {
  subscribers: EmailSubscriber[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return subscribers.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.email.toLowerCase().includes(q) ||
        (s.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [subscribers, query, statusFilter]);

  function toggle(s: EmailSubscriber) {
    const next = s.status === "active" ? "unsubscribed" : "active";
    setBusyId(s.id);
    startTransition(async () => {
      await setSubscriberStatus(s.id, next);
      router.refresh();
      setBusyId(null);
    });
  }

  function exportCsv() {
    const header = ["email", "name", "source", "status", "discount_code", "subscribed_at"];
    const rows = filtered.map((s) =>
      [
        s.email,
        s.name ?? "",
        s.source,
        s.status,
        s.discountCode ?? "",
        new Date(s.subscribedAt).toISOString(),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `y2kase-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--foreground)]/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search email or name…"
            className="w-full rounded-full border border-[var(--border)] bg-[var(--background)] py-2 pl-9 pr-4 text-sm outline-none focus:border-[var(--primary)]"
          />
        </div>
        <div className="flex gap-1.5">
          {["all", "active", "unsubscribed"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-semibold capitalize transition",
                statusFilter === s
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--muted)] text-[var(--foreground)]/70 hover:bg-[var(--border)]",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[var(--muted)]/50 text-left text-xs uppercase tracking-wide text-[var(--foreground)]/50">
              <tr>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold">Code</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Subscribed</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-[var(--muted)]/30">
                  <td className="max-w-[240px] truncate px-4 py-3 font-semibold">
                    {s.email}
                  </td>
                  <td className="px-4 py-3 text-[var(--foreground)]/70">
                    {s.name || "—"}
                  </td>
                  <td className="px-4 py-3 text-[var(--foreground)]/60">
                    {s.source}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--foreground)]/60">
                    {s.discountCode || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--foreground)]/60">
                    {dateFmt.format(new Date(s.subscribedAt))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggle(s)}
                      disabled={pending && busyId === s.id}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50",
                        s.status === "active"
                          ? "border-rose-200 text-rose-600 hover:bg-rose-50"
                          : "border-emerald-200 text-emerald-600 hover:bg-emerald-50",
                      )}
                    >
                      {pending && busyId === s.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : s.status === "active" ? (
                        <UserX className="h-3.5 w-3.5" />
                      ) : (
                        <UserCheck className="h-3.5 w-3.5" />
                      )}
                      {s.status === "active" ? "Unsubscribe" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="mt-6 text-center text-sm text-[var(--foreground)]/50">
          No subscribers match your filters.
        </p>
      )}
    </div>
  );
}

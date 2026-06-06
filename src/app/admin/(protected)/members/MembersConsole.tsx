"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, ShieldCheck, ShieldOff, BadgeCheck } from "lucide-react";
import { formatCents, cn } from "@/lib/utils";
import type { MemberRow } from "@/lib/admin/members";
import { setUserRole } from "./actions";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function MembersConsole({
  members,
  currentUserId,
}: {
  members: MemberRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      if (roleFilter === "admin" && m.role !== "admin") return false;
      if (roleFilter === "customer" && m.role !== "customer") return false;
      if (roleFilter === "guest" && !m.isAnonymous) return false;
      if (!q) return true;
      return (
        m.email.toLowerCase().includes(q) ||
        (m.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [members, query, roleFilter]);

  function toggleRole(m: MemberRow) {
    const next = m.role === "admin" ? "customer" : "admin";
    setBusyId(m.id);
    setMessage(null);
    startTransition(async () => {
      const res = await setUserRole(m.id, next);
      setMessage(res.message);
      router.refresh();
      setBusyId(null);
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--foreground)]/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            className="w-full rounded-full border border-[var(--border)] bg-[var(--background)] py-2 pl-9 pr-4 text-sm outline-none focus:border-[var(--primary)]"
          />
        </div>
        <div className="flex gap-1.5">
          {["all", "admin", "customer", "guest"].map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-semibold capitalize transition",
                roleFilter === r
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--muted)] text-[var(--foreground)]/70 hover:bg-[var(--border)]",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <p className="mb-3 rounded-xl bg-[var(--muted)] px-4 py-2 text-sm font-semibold">
          {message}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-[var(--muted)]/50 text-left text-xs uppercase tracking-wide text-[var(--foreground)]/50">
              <tr>
                <th className="px-4 py-3 font-semibold">Member</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Orders</th>
                <th className="px-4 py-3 font-semibold">Spent</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filtered.map((m) => {
                const isSelf = m.id === currentUserId;
                return (
                  <tr key={m.id} className="hover:bg-[var(--muted)]/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--muted)] text-sm font-bold uppercase">
                          {(m.name || m.email || "?").charAt(0)}
                        </span>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1 truncate font-semibold">
                            {m.name || "—"}
                            {m.emailVerified && (
                              <BadgeCheck className="h-3.5 w-3.5 text-sky-500" />
                            )}
                          </p>
                          <p className="truncate text-xs text-[var(--foreground)]/50">
                            {m.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={m.isAnonymous ? "guest" : m.role} />
                    </td>
                    <td className="px-4 py-3 text-[var(--foreground)]/70">
                      {m.orderCount}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {formatCents(m.totalSpentCents)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--foreground)]/60">
                      {dateFmt.format(new Date(m.createdAt))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {m.isAnonymous ? (
                        <span className="text-xs text-[var(--foreground)]/40">
                          guest
                        </span>
                      ) : isSelf ? (
                        <span className="text-xs text-[var(--foreground)]/40">
                          you
                        </span>
                      ) : (
                        <button
                          onClick={() => toggleRole(m)}
                          disabled={pending && busyId === m.id}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50",
                            m.role === "admin"
                              ? "border-rose-200 text-rose-600 hover:bg-rose-50"
                              : "border-emerald-200 text-emerald-600 hover:bg-emerald-50",
                          )}
                        >
                          {pending && busyId === m.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : m.role === "admin" ? (
                            <ShieldOff className="h-3.5 w-3.5" />
                          ) : (
                            <ShieldCheck className="h-3.5 w-3.5" />
                          )}
                          {m.role === "admin" ? "Revoke admin" : "Make admin"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="mt-6 text-center text-sm text-[var(--foreground)]/50">
          No members match your filters.
        </p>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    admin: "bg-fuchsia-100 text-fuchsia-700",
    customer: "bg-sky-100 text-sky-700",
    guest: "bg-gray-200 text-gray-600",
  };
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        styles[role] ?? "bg-[var(--muted)]",
      )}
    >
      {role}
    </span>
  );
}

import type { Metadata } from "next";
import { headers } from "next/headers";
import { isDbConfigured } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getMembers, getMemberStats } from "@/lib/admin/members";
import { MembersConsole } from "./MembersConsole";

export const metadata: Metadata = { title: "Admin · Members" };
export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
  if (!isDbConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Database not configured</h1>
      </div>
    );
  }

  const [members, stats, session] = await Promise.all([
    getMembers(),
    getMemberStats(),
    getSession(await headers()),
  ]);

  const cards = [
    { label: "Total members", value: stats.total },
    { label: "Admins", value: stats.admins },
    { label: "Customers", value: stats.customers },
    { label: "New this week", value: stats.newThisWeek },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-3xl font-black">Members</h1>
        <p className="mt-1 text-sm text-[var(--foreground)]/60">
          Everyone with an account — customers, admins and guests who claimed an
          account. Promote trusted teammates to admin to grant console access.
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

      <MembersConsole
        members={members}
        currentUserId={session?.user?.id ?? ""}
      />
    </div>
  );
}

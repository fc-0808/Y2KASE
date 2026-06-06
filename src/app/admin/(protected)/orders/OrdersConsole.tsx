"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { formatCents } from "@/lib/utils";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ORDER_STATUSES, type OrderRow } from "@/lib/admin/orders";
import { updateOrderStatus } from "./actions";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function OrdersConsole({ orders }: { orders: OrderRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);

  function changeStatus(orderId: number, status: string) {
    setBusyId(orderId);
    startTransition(async () => {
      await updateOrderStatus(orderId, status);
      router.refresh();
      setBusyId(null);
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-[var(--muted)]/50 text-left text-xs uppercase tracking-wide text-[var(--foreground)]/50">
            <tr>
              <th className="px-4 py-3 font-semibold">Order</th>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Items</th>
              <th className="px-4 py-3 font-semibold">Total</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Update</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-[var(--muted)]/30">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="font-mono font-bold text-[var(--primary)] hover:underline"
                  >
                    #{o.id}
                  </Link>
                </td>
                <td className="max-w-[200px] truncate px-4 py-3">{o.email}</td>
                <td className="whitespace-nowrap px-4 py-3 text-[var(--foreground)]/60">
                  {dateFmt.format(new Date(o.createdAt))}
                </td>
                <td className="px-4 py-3 text-[var(--foreground)]/60">
                  {o.itemCount}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-bold">
                  {formatCents(o.totalCents, o.currency)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={o.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <select
                      defaultValue={o.status}
                      disabled={pending && busyId === o.id}
                      onChange={(e) => changeStatus(o.id, e.target.value)}
                      className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs font-semibold capitalize outline-none focus:border-[var(--primary)]"
                    >
                      {ORDER_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    {pending && busyId === o.id && (
                      <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

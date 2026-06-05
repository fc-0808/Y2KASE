import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq, ne, or } from "drizzle-orm";
import { Package } from "lucide-react";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { getSession } from "@/lib/auth";
import { formatPrice } from "@/lib/utils";

export const metadata: Metadata = {
  title: "My Orders",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/** Human-friendly label + accent per order status. */
const STATUS_META: Record<string, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-600" },
  shipped: { label: "Shipped", className: "bg-blue-50 text-blue-600" },
  delivered: { label: "Delivered", className: "bg-emerald-50 text-emerald-600" },
  cancelled: { label: "Cancelled", className: "bg-gray-100 text-gray-500" },
  refunded: { label: "Refunded", className: "bg-amber-50 text-amber-600" },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? {
    label: status,
    className: "bg-gray-100 text-gray-500",
  };
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

export default async function AccountOrdersPage() {
  // Layout already guards access, but we re-resolve the session to scope the
  // query to exactly this user (defense-in-depth — never trust the layout alone).
  const session = await getSession(await headers());
  if (!session?.user || session.user.isAnonymous) {
    redirect("/sign-in?callbackUrl=/account/orders");
  }

  const { id: userId, email } = session.user;

  // Match orders linked to this account OR placed as a guest with this email
  // (so historical guest purchases appear once the customer signs in).
  const ownership = email
    ? or(eq(orders.userId, userId), eq(orders.email, email))
    : eq(orders.userId, userId);

  const rows = await db.query.orders.findMany({
    // Hide abandoned `pending` checkouts; show everything that was paid/handled.
    where: and(ownership, ne(orders.status, "pending")),
    with: { items: true },
    orderBy: [desc(orders.createdAt)],
    limit: 50,
  });

  if (rows.length === 0) {
    return (
      <div className="card-cute flex flex-col items-center gap-4 px-6 py-16 text-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-[var(--muted)]">
          <Package className="h-7 w-7 text-[var(--foreground)]/40" />
        </span>
        <div>
          <h2 className="text-lg font-black">No orders yet</h2>
          <p className="mt-1 text-sm text-[var(--foreground)]/60">
            When you place an order it&apos;ll show up here. ✨
          </p>
        </div>
        <Link href="/products" className="btn-candy mt-2 px-6 py-2.5 text-sm">
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {rows.map((order) => (
        <article
          key={order.id}
          className="card-cute overflow-hidden"
        >
          {/* Order header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <div>
              <p className="text-sm font-black">Order #{order.id}</p>
              <p className="text-xs text-[var(--foreground)]/55">
                {new Intl.DateTimeFormat("en-US", {
                  dateStyle: "medium",
                }).format(new Date(order.createdAt))}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={order.status} />
              <span className="text-sm font-black">
                {formatPrice(order.totalCents / 100, order.currency)}
              </span>
            </div>
          </div>

          {/* Items */}
          <ul className="divide-y divide-[var(--border)]">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--muted)]">
                  {item.imageUrl && (
                    <Image
                      src={item.imageUrl}
                      alt={item.productTitle}
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/products/${item.productSlug}`}
                    className="line-clamp-1 text-sm font-semibold hover:text-[var(--primary)]"
                  >
                    {item.productTitle}
                  </Link>
                  {item.optionValues &&
                    Object.keys(item.optionValues).length > 0 && (
                      <p className="line-clamp-1 text-xs text-[var(--foreground)]/55">
                        {Object.entries(item.optionValues)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ")}
                      </p>
                    )}
                  <p className="text-xs text-[var(--foreground)]/55">
                    Qty {item.quantity}
                  </p>
                </div>
                <span className="text-sm font-bold">
                  {formatPrice(
                    (item.unitCents * item.quantity) / 100,
                    order.currency,
                  )}
                </span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

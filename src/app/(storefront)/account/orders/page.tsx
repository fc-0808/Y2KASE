import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { Package } from "lucide-react";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { getSession } from "@/lib/auth";
import { isSignedInUser } from "@/lib/auth-redirect";
import { normalizeEmail } from "@/lib/email-address";
import { trackingLink } from "@/lib/carriers";
import { formatCents, formatOptionValues } from "@/lib/utils";
import { PRIVATE_PAGE_ROBOTS } from "@/lib/seo";

export const metadata: Metadata = {
  title: "My Orders",
  robots: PRIVATE_PAGE_ROBOTS,
};

export const dynamic = "force-dynamic";

/** Human-friendly label + accent per order status. */
const STATUS_META: Record<string, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-700" },
  shipped: { label: "Shipped", className: "bg-sky-50 text-sky-700" },
  delivered: { label: "Delivered", className: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "Cancelled", className: "bg-gray-100 text-gray-500" },
  refunded: { label: "Refunded", className: "bg-amber-50 text-amber-700" },
};

const orderDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

/** Shared money column so header, line, and summary amounts share one right edge. */
const priceCol = "w-[6.5rem] shrink-0 text-right tabular-nums";

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? {
    label: status,
    className: "bg-gray-100 text-gray-500",
  };
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-bold ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

function countryName(code: string | null | undefined): string {
  if (!code) return "";
  try {
    return (
      new Intl.DisplayNames("en", { type: "region" }).of(code.toUpperCase()) ??
      code
    );
  } catch {
    return code;
  }
}

type ShippingAddress = NonNullable<
  (typeof orders.$inferSelect)["shippingAddress"]
>;

function addressLines(address: ShippingAddress): string[] {
  const locality = [
    address.city,
    [address.state, address.postalCode].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  return [address.line1, address.line2, locality, countryName(address.country)]
    .map((line) => line?.trim())
    .filter((line): line is string => Boolean(line));
}

function MoneyLine({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <>
      <dt
        className={
          emphasize
            ? "text-sm font-black"
            : "text-sm text-[var(--foreground)]/60"
        }
      >
        {label}
      </dt>
      <dd
        className={
          emphasize
            ? `${priceCol} text-sm font-black`
            : `${priceCol} text-sm font-semibold`
        }
      >
        {value}
      </dd>
    </>
  );
}

export default async function AccountOrdersPage() {
  // Layout already guards access, but we re-resolve the session to scope the
  // query to exactly this user (defense-in-depth — never trust the layout alone).
  const session = await getSession(await headers());
  if (!session || !isSignedInUser(session.user)) {
    redirect("/sign-in?callbackUrl=/account/orders");
  }

  const { id: userId, email } = session.user;
  const emailNorm = email ? normalizeEmail(email) : "";

  // Match orders linked to this account OR placed as a guest with this email
  // (so historical guest purchases appear once the customer signs in).
  // `lower()` because Stripe and auth providers do not agree on casing.
  const ownership = emailNorm
    ? or(eq(orders.userId, userId), sql`lower(${orders.email}) = ${emailNorm}`)
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
      <div className="card-cute overflow-hidden">
        <div className="h-1 w-full bg-holo-vivid" />
        <div className="flex flex-col items-center px-6 py-14 text-center sm:py-16">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--muted)]">
            <Package className="h-6 w-6 text-[var(--foreground)]/40" />
          </span>
          <h2 className="mt-4 text-lg font-black leading-6">No orders yet</h2>
          <p className="mt-1 max-w-sm text-sm leading-5 text-[var(--foreground)]/60">
            When you place an order it&apos;ll show up here.
          </p>
          <Link
            href="/products"
            className="btn-candy mt-5 inline-flex h-10 items-center justify-center px-6 text-sm"
          >
            Start shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((order) => {
        const lines = order.shippingAddress
          ? addressLines(order.shippingAddress)
          : [];
        const trackHref = trackingLink(
          order.carrier,
          order.trackingNumber,
          order.trackingUrl,
        );
        const currency = order.currency;

        return (
          <article key={order.id} className="card-cute overflow-hidden">
            <div className="h-1 w-full bg-holo-vivid" />
            <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black leading-5">Order #{order.id}</p>
                <p className="mt-0.5 text-xs leading-4 text-[var(--foreground)]/55">
                  {orderDate.format(new Date(order.createdAt))}
                </p>
              </div>
              <StatusBadge status={order.status} />
              <span className={`${priceCol} text-sm font-black leading-5`}>
                {formatCents(order.totalCents, currency)}
              </span>
            </div>

            <ul className="divide-y divide-[var(--border)]">
              {order.items.map((item) => {
                const options = formatOptionValues(item.optionValues);
                return (
                  <li
                    key={item.id}
                    className="flex items-start gap-3 px-5 py-3.5"
                  >
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--product-surface)] ring-1 ring-[var(--border)]">
                      {item.imageUrl ? (
                        <Image
                          src={item.imageUrl}
                          alt={item.productTitle}
                          fill
                          unoptimized
                          sizes="56px"
                          className="object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/products/${item.productSlug}`}
                        className="line-clamp-2 text-sm font-semibold leading-5 hover:text-[var(--primary)]"
                      >
                        {item.productTitle}
                      </Link>
                      {options ? (
                        <p className="mt-0.5 line-clamp-1 text-xs leading-4 text-[var(--foreground)]/55">
                          {options}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-xs leading-4 text-[var(--foreground)]/55">
                        Qty {item.quantity}
                      </p>
                    </div>
                    <span className={`${priceCol} text-sm font-bold leading-5`}>
                      {formatCents(item.unitCents * item.quantity, currency)}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="flex items-start gap-6 border-t border-[var(--border)] px-5 py-4">
              {order.shippingAddress ? (
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--foreground)]/45">
                    Ships to
                  </p>
                  <div className="mt-1.5 text-sm leading-5">
                    <p className="font-semibold">{order.shippingAddress.name}</p>
                    {lines.map((line) => (
                      <p key={line} className="text-[var(--foreground)]/70">
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex-1" />
              )}

              <dl className="grid shrink-0 grid-cols-[auto_6.5rem] items-baseline gap-x-6 gap-y-1.5">
                <MoneyLine
                  label="Subtotal"
                  value={formatCents(order.subtotalCents, currency)}
                />
                <MoneyLine
                  label="Shipping"
                  value={
                    order.shippingCents === 0
                      ? "Free"
                      : formatCents(order.shippingCents, currency)
                  }
                />
                {order.taxCents > 0 ? (
                  <MoneyLine
                    label="Tax"
                    value={formatCents(order.taxCents, currency)}
                  />
                ) : null}
                <div className="col-span-2 my-1 border-t border-[var(--border)]" />
                <MoneyLine
                  label="Total"
                  value={formatCents(order.totalCents, currency)}
                  emphasize
                />
              </dl>
            </div>

            {trackHref ? (
              <div className="flex flex-col gap-3 border-t border-[var(--border)] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--foreground)]/45">
                    Tracking
                  </p>
                  <p className="mt-0.5 text-sm leading-5">
                    <span className="font-semibold">{order.carrier}</span>
                    {order.trackingNumber ? (
                      <span className="text-[var(--foreground)]/60">
                        {" "}
                        · {order.trackingNumber}
                      </span>
                    ) : null}
                  </p>
                </div>
                <a
                  href={trackHref}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-candy inline-flex h-9 shrink-0 items-center justify-center self-end px-4 text-sm sm:self-auto"
                >
                  Track package
                </a>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

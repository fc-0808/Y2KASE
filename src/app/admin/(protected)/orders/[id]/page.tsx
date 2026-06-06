import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, User as UserIcon, CreditCard } from "lucide-react";
import { isDbConfigured } from "@/lib/db";
import { getOrderById } from "@/lib/admin/orders";
import { formatCents } from "@/lib/utils";
import { StatusBadge } from "@/components/admin/StatusBadge";

export const metadata: Metadata = { title: "Admin · Order" };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isDbConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Database not configured</h1>
      </div>
    );
  }

  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isFinite(orderId)) notFound();

  const order = await getOrderById(orderId);
  if (!order) notFound();

  const addr = order.shippingAddress;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <Link
        href="/admin/orders"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--foreground)]/60 hover:text-[var(--primary)]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to orders
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-black">
            Order #{order.id}
            <StatusBadge status={order.status} />
          </h1>
          <p className="mt-1 text-sm text-[var(--foreground)]/60">
            Placed {dateFmt.format(new Date(order.createdAt))}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-[var(--foreground)]/50">
            Total
          </p>
          <p className="text-2xl font-black">
            {formatCents(order.totalCents, order.currency)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Line items */}
        <section className="lg:col-span-2">
          <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
            <ul className="divide-y divide-[var(--border)]">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 p-3">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.productTitle}
                      className="h-14 w-14 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[var(--muted)] text-xl">
                      🎀
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{item.productTitle}</p>
                    {item.optionValues && (
                      <p className="truncate text-xs text-[var(--foreground)]/50">
                        {Object.entries(item.optionValues)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ")}
                      </p>
                    )}
                    <p className="text-xs text-[var(--foreground)]/50">
                      Qty {item.quantity} ×{" "}
                      {formatCents(item.unitCents, order.currency)}
                    </p>
                  </div>
                  <p className="font-bold">
                    {formatCents(item.unitCents * item.quantity, order.currency)}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {/* Totals */}
          <dl className="mt-4 space-y-1.5 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
            <Row label="Subtotal" value={formatCents(order.subtotalCents, order.currency)} />
            <Row label="Shipping" value={formatCents(order.shippingCents, order.currency)} />
            <Row label="Tax" value={formatCents(order.taxCents, order.currency)} />
            <div className="mt-2 border-t border-[var(--border)] pt-2">
              <Row
                label="Total"
                value={formatCents(order.totalCents, order.currency)}
                bold
              />
            </div>
          </dl>
        </section>

        {/* Sidebar: customer + shipping + payment */}
        <aside className="space-y-4">
          <Card title="Customer" icon={<UserIcon className="h-4 w-4" />}>
            <p className="font-semibold">{order.user?.name ?? "Guest"}</p>
            <p className="break-all text-[var(--foreground)]/60">{order.email}</p>
            {order.user && (
              <Link
                href="/admin/members"
                className="mt-1 inline-block text-xs font-semibold text-[var(--primary)] hover:underline"
              >
                View member
              </Link>
            )}
          </Card>

          <Card title="Shipping" icon={<MapPin className="h-4 w-4" />}>
            {addr ? (
              <address className="not-italic text-[var(--foreground)]/70">
                {addr.name}
                <br />
                {addr.line1}
                {addr.line2 ? (
                  <>
                    <br />
                    {addr.line2}
                  </>
                ) : null}
                <br />
                {[addr.city, addr.state, addr.postalCode]
                  .filter(Boolean)
                  .join(", ")}
                <br />
                {addr.country}
              </address>
            ) : (
              <p className="text-[var(--foreground)]/50">No address on file.</p>
            )}
          </Card>

          <Card title="Payment" icon={<CreditCard className="h-4 w-4" />}>
            <p className="break-all text-xs text-[var(--foreground)]/60">
              {order.stripePaymentIntentId
                ? `PI: ${order.stripePaymentIntentId}`
                : "No payment intent."}
            </p>
            {order.stripeSessionId && (
              <p className="mt-1 break-all text-xs text-[var(--foreground)]/40">
                Session: {order.stripeSessionId}
              </p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className={bold ? "font-bold" : "text-[var(--foreground)]/60"}>
        {label}
      </dt>
      <dd className={bold ? "font-black" : "font-semibold"}>{value}</dd>
    </div>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
      <h3 className="mb-2 flex items-center gap-1.5 font-bold">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

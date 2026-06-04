import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { Sparkles, PartyPopper } from "lucide-react";
import { db } from "@/lib/db";
import { orders, orderItems } from "@/lib/db/schema";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { formatPrice } from "@/lib/utils";
import { ClearCartOnMount } from "@/components/checkout/ClearCartOnMount";

export const metadata: Metadata = {
  title: "Order confirmed ✨",
  robots: { index: false },
};

// Always render fresh — this page reflects a just-completed transaction.
export const dynamic = "force-dynamic";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;

  let paid = false;
  let order:
    | (typeof orders.$inferSelect & { items: (typeof orderItems.$inferSelect)[] })
    | null = null;

  if (sessionId && isStripeConfigured()) {
    try {
      // Confirm with Stripe that this session was actually paid. The webhook is
      // the source of truth for fulfillment, but this gives the buyer instant,
      // trustworthy feedback even if the webhook is a second behind.
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      paid =
        session.payment_status === "paid" ||
        session.payment_status === "no_payment_required";

      const row = await db.query.orders.findFirst({
        where: eq(orders.stripeSessionId, sessionId),
        with: { items: true },
      });
      order = row ?? null;
    } catch {
      // Fall through to the generic thank-you state below.
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
      <ClearCartOnMount />

      <div className="card-cute overflow-hidden">
        <div className="h-1.5 w-full bg-holo-vivid" />
        <div className="p-8 text-center">
          <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-holo text-3xl">
            <PartyPopper className="h-8 w-8 text-[var(--primary)]" />
          </span>
          <h1 className="font-display text-2xl font-black sm:text-3xl">
            Thank you, bestie! ✨
          </h1>
          <p className="mt-2 text-[var(--foreground)]/70">
            {paid
              ? "Your payment went through and your order is confirmed."
              : "We're confirming your payment — you'll get an email shortly."}
          </p>
          {order && (
            <p className="mt-1 text-sm font-semibold text-[var(--primary)]">
              Order #{order.id}
            </p>
          )}
        </div>

        {order && order.items.length > 0 && (
          <div className="border-t border-[var(--border)] px-6 py-5">
            <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-[var(--foreground)]/60">
              Order summary
            </h2>
            <ul className="space-y-3">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3">
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
                    <p className="line-clamp-1 text-sm font-semibold">
                      {item.productTitle}
                    </p>
                    <p className="text-xs text-[var(--foreground)]/60">
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

            <div className="mt-4 space-y-1.5 border-t border-[var(--border)] pt-4 text-sm">
              <Row label="Subtotal" value={formatPrice(order.subtotalCents / 100, order.currency)} />
              <Row
                label="Shipping"
                value={
                  order.shippingCents === 0
                    ? "Free ✨"
                    : formatPrice(order.shippingCents / 100, order.currency)
                }
              />
              <div className="flex justify-between pt-1.5 text-base font-black">
                <span>Total</span>
                <span>{formatPrice(order.totalCents / 100, order.currency)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-[var(--border)] p-6">
          <Link href="/products" className="btn-candy flex w-full items-center justify-center gap-2 py-3">
            <Sparkles className="h-4 w-4" /> Keep shopping
          </Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[var(--foreground)]/70">
      <span>{label}</span>
      <span className="font-semibold text-[var(--foreground)]">{value}</span>
    </div>
  );
}

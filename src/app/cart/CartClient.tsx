"use client";

/**
 * /cart — the dedicated bag-review page shown before Stripe checkout.
 *
 * Unlike the quick side-drawer, this gives the buyer a full, transparent
 * summary — line items with quantity controls, subtotal, the exact shipping
 * (or free-shipping progress), and the grand TOTAL — so the amount here matches
 * Stripe to the cent (no surprise shipping at the payment step).
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShoppingBag,
  Minus,
  Plus,
  Trash2,
  Loader2,
  Lock,
  Truck,
  ArrowLeft,
} from "lucide-react";
import {
  useCart,
  cartSubtotal,
  lineKey,
  type CartItem,
} from "@/lib/store/cart";
import { shippingQuote } from "@/lib/pricing";
import { formatPrice } from "@/lib/utils";

export function CartClient() {
  const router = useRouter();
  const { items, removeItem, updateQuantity } = useCart();
  const [mounted, setMounted] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="min-h-[40vh]" aria-hidden />;
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-3 py-24 text-center">
        <p className="text-5xl">🛍️</p>
        <h1 className="font-display text-2xl font-extrabold">Your bag is empty</h1>
        <p className="text-sm text-[var(--foreground)]/60">
          Let&apos;s find some cute cases to fill it up. ✨
        </p>
        <Link href="/products" className="btn-candy mt-2 px-7 py-3">
          Shop all products
        </Link>
      </div>
    );
  }

  const currency = items[0]?.currency ?? "USD";
  const subtotal = cartSubtotal(items);
  const subtotalCents = Math.round(subtotal * 100);
  const quote = shippingQuote(currency, subtotalCents);
  const shipping = quote.shippingCents / 100;
  const total = subtotal + shipping;
  const remaining = quote.remainingCents / 100;
  const progress = Math.min(
    100,
    Math.round((subtotalCents / quote.freeOverCents) * 100),
  );

  async function handleCheckout() {
    setError(null);
    setCheckingOut(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            productId: i.productId,
            options: i.options,
            quantity: i.quantity,
          })),
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not start checkout.");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setCheckingOut(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="font-pixel text-[10px] uppercase tracking-tight text-[var(--primary)]">
            Almost yours
          </p>
          <h1 className="mt-1.5 font-display text-3xl font-extrabold sm:text-4xl">
            Your Bag
          </h1>
        </div>
        <Link
          href="/products"
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-[var(--primary)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Continue shopping
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        {/* ── Line items ─────────────────────────────────────────────────── */}
        <div className="divide-y divide-[var(--border)] rounded-3xl border border-[var(--border)] bg-[var(--card)] px-5 sm:px-6">
          {items.map((item) => (
            <CartRow
              key={lineKey(item.productId, item.options)}
              item={item}
              onRemove={() => removeItem(lineKey(item.productId, item.options))}
              onQty={(q) =>
                updateQuantity(lineKey(item.productId, item.options), q)
              }
            />
          ))}
        </div>

        {/* ── Order summary ──────────────────────────────────────────────── */}
        <aside className="h-fit rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 lg:sticky lg:top-24">
          <h2 className="font-display text-lg font-extrabold">Order summary</h2>

          {/* Free-shipping progress */}
          <div className="mt-4 rounded-2xl bg-[var(--muted)] p-3.5">
            {quote.qualifiesFree ? (
              <p className="flex items-center gap-2 text-sm font-bold text-[var(--primary)]">
                <Truck className="h-4 w-4" /> You&apos;ve unlocked free shipping! 🎉
              </p>
            ) : (
              <p className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground)]/70">
                <Truck className="h-4 w-4 text-[var(--primary)]" />
                Add {formatPrice(remaining, currency)} for free shipping
              </p>
            )}
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-holo-vivid transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <dl className="mt-5 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--foreground)]/65">Subtotal</dt>
              <dd className="font-semibold">{formatPrice(subtotal, currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--foreground)]/65">Shipping</dt>
              <dd className="font-semibold">
                {quote.qualifiesFree ? (
                  <span className="text-[var(--primary)]">FREE</span>
                ) : (
                  formatPrice(shipping, currency)
                )}
              </dd>
            </div>
            <div className="mt-1 flex justify-between border-t border-[var(--border)] pt-3 text-base font-extrabold">
              <dt>Total</dt>
              <dd>{formatPrice(total, currency)}</dd>
            </div>
          </dl>

          {error && (
            <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
              {error}
            </p>
          )}

          <button
            onClick={handleCheckout}
            disabled={checkingOut}
            className="btn-candy mt-5 flex w-full items-center justify-center gap-2 py-3.5 disabled:opacity-60"
          >
            {checkingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Lock className="h-4 w-4" />
            )}
            {checkingOut ? "Redirecting…" : "Proceed to secure checkout"}
          </button>

          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-[var(--foreground)]/50">
            <Lock className="h-3 w-3" /> Secure payment by Stripe · Apple Pay &
            cards accepted
          </p>
        </aside>
      </div>
    </div>
  );
}

function CartRow({
  item,
  onRemove,
  onQty,
}: {
  item: CartItem;
  onRemove: () => void;
  onQty: (q: number) => void;
}) {
  return (
    <div className="flex gap-4 py-5">
      <Link
        href={`/products/${item.slug}`}
        className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-[var(--muted)]"
      >
        {item.imageUrl && (
          <Image
            src={item.imageUrl}
            alt={item.title}
            fill
            sizes="96px"
            className="object-cover"
          />
        )}
      </Link>

      <div className="flex flex-1 flex-col">
        <div className="flex justify-between gap-3">
          <Link
            href={`/products/${item.slug}`}
            className="line-clamp-2 text-sm font-bold leading-snug hover:text-[var(--primary)]"
          >
            {item.title}
          </Link>
          <button
            onClick={onRemove}
            aria-label="Remove item"
            className="h-fit text-[var(--foreground)]/40 transition hover:text-[var(--primary)]"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {Object.entries(item.options).length > 0 && (
          <p className="mt-1 text-xs text-[var(--foreground)]/60">
            {Object.entries(item.options)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between pt-3">
          <div className="flex items-center rounded-full border border-[var(--border)]">
            <button
              onClick={() => onQty(item.quantity - 1)}
              aria-label="Decrease quantity"
              className="grid h-8 w-8 place-items-center hover:text-[var(--primary)]"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-7 text-center text-sm font-bold">
              {item.quantity}
            </span>
            <button
              onClick={() => onQty(item.quantity + 1)}
              aria-label="Increase quantity"
              className="grid h-8 w-8 place-items-center hover:text-[var(--primary)]"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <span className="font-extrabold text-[var(--primary)]">
            {formatPrice(item.price * item.quantity, item.currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

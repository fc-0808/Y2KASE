"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { X, Minus, Plus, Trash2, Truck } from "lucide-react";
import {
  useCart,
  cartSubtotal,
  lineKey,
  type CartItem,
} from "@/lib/store/cart";
import { shippingQuote } from "@/lib/pricing";
import { formatPrice } from "@/lib/utils";

export function CartDrawer() {
  const { items, isOpen, close, removeItem, updateQuantity } = useCart();
  const [mounted, setMounted] = useState(false);
  // Hydration guard: cart state lives in a persisted client store.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const subtotal = cartSubtotal(items);
  const currency = items[0]?.currency ?? "USD";
  const quote = shippingQuote(currency, Math.round(subtotal * 100));
  const remaining = quote.remainingCents / 100;

  return (
    <>
      <div
        aria-hidden={!isOpen}
        onClick={close}
        className={`fixed inset-0 z-50 bg-black/30 transition-opacity ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      {/* Viewport-sized clip layer: keeps the off-canvas panel (parked at
          translate-x-full) from ever extending the page's overflow region.
          Because the panel is `absolute` inside this `overflow-x-hidden` box,
          it cannot cause horizontal scroll / mobile zoom-out on ANY browser —
          including iOS Safari, where root `overflow-x: clip` is unreliable for
          fixed-positioned descendants. The layer ignores pointer events so the
          backdrop behind it stays clickable; the panel re-enables them. */}
      <div className="pointer-events-none fixed inset-0 z-50 overflow-x-hidden">
        <aside
          role="dialog"
          aria-label="Shopping cart"
          className={`pointer-events-auto absolute right-0 top-0 flex h-dvh w-full max-w-md flex-col bg-[var(--card)] shadow-2xl transition-transform duration-300 ${
            isOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
        <div className="h-1 w-full shrink-0 bg-holo-vivid" />
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="font-display text-lg font-extrabold">Your Bag ✨</h2>
          <button
            onClick={close}
            aria-label="Close cart"
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-[var(--muted)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-2xl">🛍️</p>
            <p className="font-semibold">Your bag is empty</p>
            <p className="text-sm text-[var(--foreground)]/60">
              Add some cute cases to get started.
            </p>
          </div>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {items.map((item) => (
              <CartLine
                key={lineKey(item.productId, item.options)}
                item={item}
                onRemove={() =>
                  removeItem(lineKey(item.productId, item.options))
                }
                onQty={(q) =>
                  updateQuantity(lineKey(item.productId, item.options), q)
                }
              />
            ))}
          </div>
        )}

        {items.length > 0 && (
          <div className="space-y-3 border-t border-[var(--border)] px-5 py-4">
            {/* Free-shipping nudge so the buyer always knows where they stand */}
            <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]/70">
              <Truck className="h-3.5 w-3.5 text-[var(--primary)]" />
              {quote.qualifiesFree
                ? "You've unlocked free shipping! 🎉"
                : `Add ${formatPrice(remaining, currency)} for free shipping`}
            </p>
            <div className="flex items-center justify-between text-base font-bold">
              <span>Subtotal</span>
              <span>{formatPrice(subtotal, currency)}</span>
            </div>
            <Link
              href="/cart"
              onClick={close}
              className="btn-candy flex w-full items-center justify-center gap-2 py-3"
            >
              View bag & checkout
            </Link>
          </div>
        )}
        </aside>
      </div>
    </>
  );
}

function CartLine({
  item,
  onRemove,
  onQty,
}: {
  item: CartItem;
  onRemove: () => void;
  onQty: (q: number) => void;
}) {
  return (
    <div className="flex gap-3">
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[var(--muted)]">
        {item.imageUrl && (
          <Image
            src={item.imageUrl}
            alt={item.title}
            fill
            sizes="80px"
            className="object-cover"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex justify-between gap-2">
          <p className="line-clamp-2 text-sm font-semibold">{item.title}</p>
          <button
            onClick={onRemove}
            aria-label="Remove item"
            className="text-[var(--foreground)]/40 hover:text-[var(--primary)]"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        {Object.entries(item.options).length > 0 && (
          <p className="mt-0.5 text-xs text-[var(--foreground)]/60">
            {Object.entries(item.options)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between">
          <div className="flex items-center rounded-full border border-[var(--border)]">
            <button
              onClick={() => onQty(item.quantity - 1)}
              aria-label="Decrease quantity"
              className="grid h-7 w-7 place-items-center"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-6 text-center text-sm font-semibold">
              {item.quantity}
            </span>
            <button
              onClick={() => onQty(item.quantity + 1)}
              aria-label="Increase quantity"
              className="grid h-7 w-7 place-items-center"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <span className="text-sm font-bold">
            {formatPrice(item.price * item.quantity, item.currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

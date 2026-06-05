"use client";

/**
 * /cart — the dedicated bag-review page shown before Stripe checkout.
 *
 * Premium summary: line items with quantity controls, a promo-code field that
 * validates against Stripe and previews the discount, and a fully transparent
 * Subtotal / Discount / Shipping / Total — so the amount here matches Stripe to
 * the cent (no surprise shipping or pricing at the payment step).
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Minus,
  Plus,
  Trash2,
  Loader2,
  Lock,
  Truck,
  ArrowLeft,
  Tag,
  X,
  Check,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import {
  useCart,
  cartSubtotal,
  lineKey,
  type CartItem,
} from "@/lib/store/cart";
import { shippingQuote } from "@/lib/pricing";
import { formatPrice } from "@/lib/utils";

type AppliedCoupon = { code: string; label: string; discountCents: number };

export function CartClient() {
  const { items, removeItem, updateQuantity } = useCart();
  const [mounted, setMounted] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Coupon state
  const [codeInput, setCodeInput] = useState("");
  const [applying, setApplying] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="min-h-[50vh]" aria-hidden />;
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
  const remaining = quote.remainingCents / 100;
  const progress = Math.min(
    100,
    Math.round((subtotalCents / quote.freeOverCents) * 100),
  );

  // Discount preview (Stripe re-validates and is authoritative at payment).
  const discountCents = coupon
    ? Math.min(coupon.discountCents, subtotalCents)
    : 0;
  const discount = discountCents / 100;
  const total = Math.max(0, subtotal - discount) + shipping;

  async function applyCoupon() {
    const code = codeInput.trim();
    if (!code) return;
    setCouponError(null);
    setApplying(true);
    try {
      const res = await fetch("/api/coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, subtotalCents, currency }),
      });
      const data = (await res.json()) as {
        valid: boolean;
        code?: string;
        label?: string;
        discountCents?: number;
        error?: string;
      };
      if (!data.valid) {
        setCouponError(data.error ?? "That code isn't valid.");
        return;
      }
      setCoupon({
        code: data.code ?? code.toUpperCase(),
        label: data.label ?? "Discount",
        discountCents: data.discountCents ?? 0,
      });
      setCodeInput("");
    } catch {
      setCouponError("Couldn't check that code. Try again.");
    } finally {
      setApplying(false);
    }
  }

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
          promotionCode: coupon?.code,
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
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="font-pixel text-[10px] uppercase tracking-tight text-[var(--primary)]">
            Almost yours
          </p>
          <h1 className="mt-1.5 font-display text-3xl font-extrabold sm:text-4xl">
            Your Bag{" "}
            <span className="align-middle text-base font-bold text-[var(--foreground)]/40">
              ({items.reduce((n, i) => n + i.quantity, 0)})
            </span>
          </h1>
        </div>
        <Link
          href="/products"
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-[var(--primary)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Continue shopping
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:gap-10">
        {/* ── Line items ─────────────────────────────────────────────────── */}
        <div className="space-y-3">
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

          {/* Trust badges */}
          <div className="grid grid-cols-3 gap-3 pt-3">
            <TrustBadge icon={<ShieldCheck className="h-4 w-4" />} label="Secure checkout" />
            <TrustBadge icon={<Truck className="h-4 w-4" />} label="Tracked shipping" />
            <TrustBadge icon={<RotateCcw className="h-4 w-4" />} label="Easy returns" />
          </div>
        </div>

        {/* ── Order summary ──────────────────────────────────────────────── */}
        <aside className="h-fit lg:sticky lg:top-24">
          <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-[0_18px_50px_-30px_rgba(120,60,120,0.5)]">
            <div className="h-1 w-full bg-holo-vivid" />
            <div className="p-6">
              <h2 className="font-display text-lg font-extrabold">Order summary</h2>

              {/* Free-shipping progress */}
              <div className="mt-4 rounded-2xl bg-[var(--muted)] p-3.5">
                {quote.qualifiesFree ? (
                  <p className="flex items-center gap-2 text-sm font-bold text-[var(--primary)]">
                    <Truck className="h-4 w-4" /> You&apos;ve unlocked free shipping! 🎉
                  </p>
                ) : (
                  <p className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground)]/70">
                    <Truck className="h-4 w-4 shrink-0 text-[var(--primary)]" />
                    You&apos;re {formatPrice(remaining, currency)} away from free shipping
                  </p>
                )}
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-holo-vivid transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Promo code */}
              <div className="mt-5">
                {coupon ? (
                  <div className="flex items-center justify-between rounded-2xl border border-[var(--primary)]/30 bg-[var(--primary-soft)] px-3.5 py-2.5">
                    <span className="flex items-center gap-2 text-sm font-bold text-[var(--primary)]">
                      <Check className="h-4 w-4" /> {coupon.code} · {coupon.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setCoupon(null);
                        setCouponError(null);
                      }}
                      aria-label="Remove code"
                      className="text-[var(--primary)]/70 transition hover:text-[var(--primary)]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <label
                      htmlFor="promo"
                      className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50"
                    >
                      <Tag className="h-3.5 w-3.5" /> Promo code
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="promo"
                        value={codeInput}
                        onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            applyCoupon();
                          }
                        }}
                        placeholder="WELCOME10"
                        autoComplete="off"
                        autoCapitalize="characters"
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2.5 text-sm font-semibold uppercase tracking-wide outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
                      />
                      <button
                        type="button"
                        onClick={applyCoupon}
                        disabled={applying || !codeInput.trim()}
                        className="shrink-0 rounded-xl border-2 border-[var(--primary)] px-4 text-sm font-bold text-[var(--primary)] transition hover:bg-[var(--primary)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                      </button>
                    </div>
                    {couponError && (
                      <p className="mt-1.5 text-xs font-semibold text-red-500">
                        {couponError}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Totals */}
              <dl className="mt-5 space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[var(--foreground)]/65">Subtotal</dt>
                  <dd className="font-semibold">{formatPrice(subtotal, currency)}</dd>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-[var(--primary)]">
                    <dt className="font-semibold">Discount</dt>
                    <dd className="font-bold">−{formatPrice(discount, currency)}</dd>
                  </div>
                )}
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
                <div className="mt-1 flex items-baseline justify-between border-t border-[var(--border)] pt-3">
                  <dt className="text-base font-extrabold">Total</dt>
                  <dd className="font-display text-xl font-extrabold">
                    {formatPrice(total, currency)}
                  </dd>
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
                <Lock className="h-3 w-3" /> Encrypted & secured by Stripe
              </p>

              {/* Payment methods */}
              <div className="mt-3 flex items-center justify-center gap-1.5 opacity-80">
                <PayBadge>VISA</PayBadge>
                <PayBadge>MC</PayBadge>
                <PayBadge>AMEX</PayBadge>
                <PayBadge> Pay</PayBadge>
                <PayBadge>G Pay</PayBadge>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function TrustBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-2 py-3 text-center">
      <span className="text-[var(--primary)]">{icon}</span>
      <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/55">
        {label}
      </span>
    </div>
  );
}

function PayBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid h-6 min-w-9 place-items-center rounded-md border border-[var(--border)] bg-white px-1.5 text-[9px] font-black tracking-tight text-[var(--foreground)]/60">
      {children}
    </span>
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
    <div className="flex gap-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-3.5 sm:p-4">
      <Link
        href={`/products/${item.slug}`}
        className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-[var(--muted)] sm:h-28 sm:w-28"
      >
        {item.imageUrl && (
          <Image
            src={item.imageUrl}
            alt={item.title}
            fill
            sizes="112px"
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
          <div className="text-right">
            <span className="font-extrabold text-[var(--primary)]">
              {formatPrice(item.price * item.quantity, item.currency)}
            </span>
            {item.quantity > 1 && (
              <span className="block text-[10px] text-[var(--foreground)]/45">
                {formatPrice(item.price, item.currency)} each
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

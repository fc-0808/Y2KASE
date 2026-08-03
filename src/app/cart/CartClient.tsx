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
  Tag,
  X,
  Check,
  ShieldCheck,
  RotateCcw,
  Gift,
  Sparkles,
  HelpCircle,
} from "lucide-react";
import {
  useCart,
  cartSubtotal,
  lineKey,
  type CartItem,
} from "@/lib/store/cart";
import { shippingQuote } from "@/lib/pricing";
import { usePromoActions, useSavedPromoCode } from "@/lib/store/promo";
import { computePromotions, BUNDLE } from "@/lib/promotions";
import { formatPrice } from "@/lib/utils";
import { trackBeginCheckout } from "@/lib/analytics/gtag";

/** Ties the "?" toggle to the disclosure it reveals (`aria-controls`). */
const BUNDLE_INFO_ID = "bundle-how-it-works";

export function CartClient() {
  const { items, removeItem, updateQuantity } = useCart();
  const [mounted, setMounted] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The applied code lives in the persisted promo store, not local state: the
  // welcome pop-up saves it there before this page ever mounts, and a code the
  // buyer typed has to survive the reload between reviewing the bag and coming
  // back to pay. It is kept even while the bundle is active, so it silently
  // re-applies if they drop below 4 items.
  const [codeInput, setCodeInput] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);
  const appliedCode = useSavedPromoCode();
  const { apply: applyPromo, clear: clearPromo } = usePromoActions();

  // "How it works" for the bundle offer. Implemented as an inline disclosure
  // rather than an absolutely-positioned tooltip because the summary card is
  // `overflow-hidden` (a popover would be clipped) — and a tap target beats a
  // hover-only tooltip on mobile, where most of this traffic converts.
  const [bundleInfoOpen, setBundleInfoOpen] = useState(false);

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

  // Single source of truth for pricing — the SAME engine the checkout route runs
  // server-side, so this preview equals the Stripe charge to the cent. It also
  // enforces mutual exclusivity: while the bundle is active the coupon is ignored.
  const promo = computePromotions(
    items.map((i) => ({
      unitCents: Math.round(i.price * 100),
      quantity: i.quantity,
    })),
    appliedCode,
  );
  const totalUnits = items.reduce((n, i) => n + i.quantity, 0);
  const bundleActive = promo.bundleActive;
  const discount = promo.discountCents / 100;
  const total = promo.totalAfterDiscountCents / 100 + shipping;
  // Units still needed to unlock the bundle (0 once active).
  const unitsToBundle = Math.max(0, BUNDLE.groupSize - totalUnits);

  /** Validate + apply a coupon locally (instant — no network round-trip). */
  function applyCoupon() {
    const code = codeInput.trim();
    if (!code) return;
    if (!applyPromo(code, "manual")) {
      setCouponError("That code isn't valid.");
      return;
    }
    setCodeInput("");
    setCouponError(null);
  }

  async function handleCheckout() {
    setError(null);
    setCheckingOut(true);
    // Only attribute the coupon if it actually applied (not while bundle wins).
    trackBeginCheckout(items, currency, promo.appliedCode ?? undefined);
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
          couponCode: appliedCode,
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
      {/* "Continue shopping" lives in the minimal checkout header, so the page
          keeps exactly one unambiguous way back out of the funnel. */}
      <div className="mb-8">
        <p className="font-pixel text-[10px] uppercase tracking-tight text-[var(--primary)]">
          Almost yours
        </p>
        <h1 className="mt-1.5 font-display text-3xl font-extrabold sm:text-4xl">
          Your Bag{" "}
          <span className="align-middle text-base font-bold text-[var(--foreground)]/40">
            ({totalUnits})
          </span>
        </h1>
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
        </div>

        {/* ── Order summary ──────────────────────────────────────────────── */}
        {/* Trust signals now live inside this card, directly under the CTA —
            where they reassure at the moment of commitment instead of
            competing with the line items. */}
        <aside className="h-fit lg:sticky lg:top-8">
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

              {/* Bundle status — the automatic "Buy 2, Get 2 Free" offer.
                  One short, scannable line; the full mechanics live behind the
                  "?" so the summary stays uncluttered for the 90% who don't
                  need them. */}
              <div className="mt-4">
                <div
                  className={`flex items-center gap-2.5 rounded-2xl px-3.5 py-3 ${
                    bundleActive
                      ? "border border-[var(--primary)]/30 bg-[var(--primary-soft)]"
                      : "bg-[var(--muted)]"
                  }`}
                >
                  {bundleActive ? (
                    <>
                      <Sparkles className="h-4 w-4 shrink-0 text-[var(--primary)]" />
                      <p className="flex-1 text-xs font-bold leading-relaxed text-[var(--primary)]">
                        🎉 {BUNDLE.label} unlocked!
                      </p>
                    </>
                  ) : (
                    <>
                      <Gift className="h-4 w-4 shrink-0 text-[var(--primary)]" />
                      <p className="flex-1 text-xs font-semibold leading-relaxed text-[var(--foreground)]/70">
                        Add{" "}
                        <strong className="text-[var(--primary)]">
                          {unitsToBundle} more
                        </strong>{" "}
                        to unlock{" "}
                        <strong className="text-[var(--primary)]">
                          {BUNDLE.label}
                        </strong>
                      </p>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setBundleInfoOpen((v) => !v)}
                    aria-expanded={bundleInfoOpen}
                    aria-controls={BUNDLE_INFO_ID}
                    aria-label={`How ${BUNDLE.label} works`}
                    // Negative margin keeps the icon visually small while giving
                    // it a 24px touch target.
                    className="-m-1 shrink-0 rounded-full p-1 text-[var(--foreground)]/40 transition hover:text-[var(--primary)]"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </div>

                {bundleInfoOpen && (
                  <p
                    id={BUNDLE_INFO_ID}
                    className="mt-2 px-1 text-[11px] leading-relaxed text-[var(--foreground)]/50"
                  >
                    Add {BUNDLE.groupSize} items in total — the free ones must be
                    in your bag too. The discount applies automatically at
                    checkout, where the {BUNDLE.freePerGroup} lowest-priced items
                    are waived.
                  </p>
                )}
              </div>

              {/* Promo code — disabled whenever the bundle is active (no stacking). */}
              <div className="mt-4">
                {appliedCode && !bundleActive ? (
                  /* Applied state reads as a removable PILL, not an empty
                     input — the code, what it saved, and one clear way out. */
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--primary)]/30 bg-[var(--primary-soft)] py-1.5 pl-3 pr-1.5 text-sm font-bold text-[var(--primary)]">
                      <Check className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate tracking-wide">
                        {promo.appliedCode}
                      </span>
                      <span className="shrink-0 font-extrabold">
                        (−{formatPrice(discount, currency)})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          clearPromo();
                          setCouponError(null);
                        }}
                        aria-label={`Remove promo code ${promo.appliedCode}`}
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--primary)]/15 text-[var(--primary)] transition hover:bg-[var(--primary)] hover:text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                    <span className="text-xs font-semibold text-[var(--foreground)]/50">
                      {promo.appliedLabel} applied
                    </span>
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
                        disabled={bundleActive}
                        onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            applyCoupon();
                          }
                        }}
                        placeholder="BESTIE10"
                        autoComplete="off"
                        autoCapitalize="characters"
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3.5 py-2.5 text-sm font-semibold uppercase tracking-wide outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={applyCoupon}
                        disabled={bundleActive || !codeInput.trim()}
                        className="shrink-0 rounded-xl border-2 border-[var(--primary)] px-4 text-sm font-bold text-[var(--primary)] transition hover:bg-[var(--primary)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Apply
                      </button>
                    </div>
                    {bundleActive ? (
                      <p className="mt-1.5 text-xs font-semibold text-[var(--primary)]">
                        Bundle active! Coupon codes cannot be stacked.
                      </p>
                    ) : (
                      couponError && (
                        <p className="mt-1.5 text-xs font-semibold text-red-500">
                          {couponError}
                        </p>
                      )
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
                    <dt className="font-semibold">
                      {promo.appliedLabel ?? "Discount"}
                    </dt>
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

              {/* Reassurance strip — subtle inline text, never mistakable for
                  another set of buttons competing with the CTA above. */}
              <ul className="mt-3.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
                <TrustBadge
                  icon={<ShieldCheck className="h-3.5 w-3.5" />}
                  label="Secure checkout"
                />
                <TrustBadge
                  icon={<Truck className="h-3.5 w-3.5" />}
                  label="Tracked shipping"
                />
                <TrustBadge
                  icon={<RotateCcw className="h-3.5 w-3.5" />}
                  label="Easy returns"
                />
              </ul>

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

/** Subtle inline reassurance item shown beneath the checkout CTA. */
function TrustBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--foreground)]/55">
      <span className="shrink-0 text-[var(--primary)]/70">{icon}</span>
      {label}
    </li>
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
        className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-[var(--product-surface)] sm:h-28 sm:w-28"
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

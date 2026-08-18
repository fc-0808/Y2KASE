"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Gift,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import { gaEvent } from "@/lib/analytics/gtag";
import {
  useBodyScrollLock,
  useModalFocusTrap,
} from "@/lib/hooks/use-modal-dialog";
import {
  claimMarketingPopup,
  hasMarketingPopupClaim,
  isMarketingPopupPath,
} from "@/lib/marketing/popup-session";
import { CART_RECOVERY_POLICY } from "@/lib/marketing/popup-policy";
import { BUNDLE, computePromotions, WELCOME_COUPON } from "@/lib/promotions";
import { cartCount, useCart } from "@/lib/store/cart";
import {
  usePromoActions,
  usePromoStore,
  useSavedPromoCode,
  selectSavedCode,
} from "@/lib/store/promo";
import {
  useHasBlockingOverlay,
  useOverlayLock,
  useOverlayStore,
} from "@/lib/store/overlay";

const LS_KEY_SHOWN_AT = "y2k_cart_recovery_shown_at";
const LS_KEY_DISMISS_COUNT = "y2k_cart_recovery_dismiss_count";
const LS_KEY_DISMISSED_AT = "y2k_cart_recovery_dismissed_at";

/** One recovery impression per three days, with a 30-day pause after three noes. */
const {
  throttleMs: THROTTLE_MS,
  dismissalPauseMs: DISMISSAL_PAUSE_MS,
  maxDismissals: MAX_DISMISSALS,
  exitArmDelayMs: EXIT_ARM_DELAY_MS,
  touchIdleDelayMs: TOUCH_IDLE_DELAY_MS,
} = CART_RECOVERY_POLICY;

const PROMOTION = {
  promotion_id: "cart_recovery_popup",
  promotion_name: "Cart recovery — saved bag + available promo",
  creative_slot: "exit_intent_modal",
} as const;

type RecoveryTrigger = "exit-intent" | "touch-idle" | "preview";
type DismissReason = "close-button" | "backdrop" | "escape" | "keep-shopping";

function isPreview(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("popup") === "cart" || params.get("cart-popup") === "1"
  );
}

function readStoredNumber(key: string): number {
  try {
    const value = Number(window.localStorage.getItem(key) ?? "0");
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeStoredNumber(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Frequency caps are UX safeguards, not a reason to break the storefront.
  }
}

function canShowRecovery(now: number): boolean {
  const lastShownAt = readStoredNumber(LS_KEY_SHOWN_AT);
  if (now - lastShownAt < THROTTLE_MS) return false;

  const dismissedAt = readStoredNumber(LS_KEY_DISMISSED_AT);
  const dismissCount = readStoredNumber(LS_KEY_DISMISS_COUNT);
  if (
    dismissCount >= MAX_DISMISSALS &&
    now - dismissedAt < DISMISSAL_PAUSE_MS
  ) {
    return false;
  }

  // A shopper gets a clean slate after the pause instead of being retired
  // forever because of decisions made against an old cart.
  if (
    dismissCount > 0 &&
    dismissedAt > 0 &&
    now - dismissedAt >= DISMISSAL_PAUSE_MS
  ) {
    writeStoredNumber(LS_KEY_DISMISS_COUNT, 0);
  }
  return true;
}

function markShown(now: number): void {
  writeStoredNumber(LS_KEY_SHOWN_AT, now);
}

function markDismissed(now: number): void {
  const lastDismissedAt = readStoredNumber(LS_KEY_DISMISSED_AT);
  const previous =
    lastDismissedAt > 0 && now - lastDismissedAt < DISMISSAL_PAUSE_MS
      ? readStoredNumber(LS_KEY_DISMISS_COUNT)
      : 0;
  writeStoredNumber(LS_KEY_DISMISS_COUNT, previous + 1);
  writeStoredNumber(LS_KEY_DISMISSED_AT, now);
}

export function CartRecoveryPop() {
  const items = useCart((state) => state.items);
  const cartOpen = useCart((state) => state.isOpen);
  const savedCode = useSavedPromoCode();
  const { autoApply } = usePromoActions();
  const blockingOverlay = useHasBlockingOverlay();
  const pathname = usePathname();

  const [isOpen, setIsOpen] = useState(false);
  const [trigger, setTrigger] = useState<RecoveryTrigger>("exit-intent");
  const [preview] = useState(isPreview);

  const dialogRef = useRef<HTMLDivElement>(null);
  const enteredAtRef = useRef(0);
  const shownThisLifecycleRef = useRef(false);
  const previousPathRef = useRef(pathname);

  const itemCount = cartCount(items);
  const currency = items[0]?.currency ?? "USD";
  const promo = computePromotions(
    items.map((item) => ({
      unitCents: Math.round(item.price * 100),
      quantity: item.quantity,
    })),
    savedCode,
  );
  const payableSubtotal = promo.totalAfterDiscountCents / 100;
  const firstItem = items[0];

  useOverlayLock("cart-recovery", isOpen);
  useBodyScrollLock(isOpen);

  useEffect(() => {
    enteredAtRef.current = Date.now();
  }, []);

  const dismiss = useCallback(
    (reason: DismissReason) => {
      if (!isOpen) return;

      if (!preview) {
        markDismissed(Date.now());
        gaEvent("popup_dismiss", {
          ...PROMOTION,
          popup_trigger: trigger,
          dismiss_reason: reason,
          currency: currency.toUpperCase(),
          value: payableSubtotal,
          item_count: itemCount,
        });
      }
      setIsOpen(false);
    },
    [currency, isOpen, itemCount, payableSubtotal, preview, trigger],
  );

  const dismissFromKeyboard = useCallback(
    () => dismiss("escape"),
    [dismiss],
  );
  useModalFocusTrap(dialogRef, isOpen, dismissFromKeyboard);

  const openPopup = useCallback(
    (nextTrigger: RecoveryTrigger): boolean => {
      // Re-read stores at fire time. Exit-intent / idle timers can race the same
      // tick as add-to-cart, drawer open, or another marketing claim.
      const liveCart = useCart.getState();
      const liveItemCount = cartCount(liveCart.items);
      const overlayActive = useOverlayStore.getState().active.length > 0;
      const livePath =
        typeof window !== "undefined"
          ? window.location.pathname
          : pathname;

      if (
        isOpen ||
        shownThisLifecycleRef.current ||
        !isMarketingPopupPath(livePath) ||
        liveItemCount === 0 ||
        liveCart.isOpen ||
        overlayActive ||
        document.visibilityState !== "visible"
      ) {
        return false;
      }

      const now = Date.now();
      if (!preview) {
        if (!canShowRecovery(now) || hasMarketingPopupClaim()) return false;
        if (!claimMarketingPopup("cart-recovery")) return false;
        markShown(now);
      }

      // BESTIE10 is public and already advertised site-wide. Saving it removes
      // checkout friction while `autoApply` protects any better incumbent code.
      autoApply(WELCOME_COUPON.code, "cart-recovery-popup");
      shownThisLifecycleRef.current = true;
      setTrigger(nextTrigger);
      setIsOpen(true);

      if (!preview) {
        const promoState = usePromoStore.getState();
        const liveCode = selectSavedCode(promoState);
        const livePromo = computePromotions(
          liveCart.items.map((item) => ({
            unitCents: Math.round(item.price * 100),
            quantity: item.quantity,
          })),
          liveCode,
        );
        gaEvent("view_promotion", {
          ...PROMOTION,
          popup_trigger: nextTrigger,
          currency: (liveCart.items[0]?.currency ?? currency).toUpperCase(),
          value: livePromo.totalAfterDiscountCents / 100,
          item_count: liveItemCount,
        });
      }
      return true;
    },
    [autoApply, currency, isOpen, pathname, preview],
  );

  // QA override: add an item, then open `?popup=cart` or `?cart-popup=1`.
  useEffect(() => {
    if (!preview) return;
    const timer = window.setTimeout(() => openPopup("preview"), 0);
    return () => window.clearTimeout(timer);
  }, [openPopup, preview]);

  // Fine-pointer devices provide a reliable signal when the pointer leaves
  // through the browser chrome. Internal element transitions are filtered by
  // `relatedTarget`, preventing false positives while moving around the page.
  useEffect(() => {
    if (
      preview ||
      isOpen ||
      shownThisLifecycleRef.current ||
      !isMarketingPopupPath(pathname) ||
      itemCount === 0
    ) {
      return;
    }

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (!finePointer.matches) return;

    function onMouseOut(event: MouseEvent) {
      if (Date.now() - enteredAtRef.current < EXIT_ARM_DELAY_MS) return;
      if (event.relatedTarget !== null || event.clientY > 12) return;
      openPopup("exit-intent");
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        enteredAtRef.current = Date.now();
      }
    }

    document.addEventListener("mouseout", onMouseOut);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("mouseout", onMouseOut);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isOpen, itemCount, openPopup, pathname, preview]);

  // Touch browsers do not expose dependable exit intent. After 45 seconds of
  // genuine inactivity, a cart-bearing shopper gets one contextual reminder.
  // Any interaction restarts the clock; hiding the tab pauses it completely.
  useEffect(() => {
    if (
      preview ||
      isOpen ||
      shownThisLifecycleRef.current ||
      !isMarketingPopupPath(pathname) ||
      itemCount === 0 ||
      cartOpen ||
      blockingOverlay
    ) {
      return;
    }

    const coarsePointer = window.matchMedia(
      "(hover: none), (pointer: coarse)",
    );
    if (!coarsePointer.matches) return;

    let timer: number | undefined;
    const clear = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    };
    const schedule = () => {
      clear();
      if (document.visibilityState !== "visible") return;
      timer = window.setTimeout(
        () => {
          const focused = document.activeElement;
          const editing =
            focused instanceof HTMLElement &&
            focused.matches(
              "input, textarea, select, [contenteditable='true']",
            );
          const mediaPlaying = Array.from(
            document.querySelectorAll<HTMLMediaElement>("video, audio"),
          ).some((media) => !media.paused && !media.ended);

          if (editing || mediaPlaying || document.fullscreenElement) {
            schedule();
            return;
          }
          openPopup("touch-idle");
        },
        TOUCH_IDLE_DELAY_MS,
      );
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") schedule();
      else clear();
    };

    schedule();
    document.addEventListener("pointerdown", schedule, { passive: true });
    document.addEventListener("touchstart", schedule, { passive: true });
    document.addEventListener("keydown", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("input", schedule);
    document.addEventListener("change", schedule);
    document.addEventListener("fullscreenchange", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clear();
      document.removeEventListener("pointerdown", schedule);
      document.removeEventListener("touchstart", schedule);
      document.removeEventListener("keydown", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("input", schedule);
      document.removeEventListener("change", schedule);
      document.removeEventListener("fullscreenchange", schedule);
      window.removeEventListener("scroll", schedule);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [
    blockingOverlay,
    cartOpen,
    isOpen,
    itemCount,
    openPopup,
    pathname,
    preview,
  ]);

  // Root-layout client components survive normal storefront navigation.
  // Never carry an open dialog into a page the shopper just chose to visit.
  useEffect(() => {
    if (previousPathRef.current !== pathname) {
      previousPathRef.current = pathname;
      enteredAtRef.current = Date.now();
      setIsOpen(false);
    }
  }, [pathname]);

  function handleCheckoutClick() {
    if (!preview) {
      gaEvent("select_promotion", {
        ...PROMOTION,
        popup_trigger: trigger,
        currency: currency.toUpperCase(),
        value: payableSubtotal,
        item_count: itemCount,
      });
    }
    setIsOpen(false);
  }

  if (!isOpen || !firstItem) return null;

  const variant = Object.values(firstItem.options)
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ");
  const extraLines = Math.max(0, items.length - 1);
  const offerLabel = promo.bundleActive
    ? `${BUNDLE.label} unlocked`
    : promo.appliedLabel
      ? `${promo.appliedLabel} applied`
      : `${WELCOME_COUPON.label} saved`;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm"
        aria-hidden="true"
        onClick={() => dismiss("backdrop")}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-recovery-title"
        aria-describedby="cart-recovery-description cart-recovery-note"
        tabIndex={-1}
        className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[51] mx-auto max-h-[min(100dvh-2rem,calc(100svh-2rem))] max-w-md overflow-y-auto overscroll-contain focus:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2"
      >
        <div className="card-cute relative overflow-hidden animate-float-up">
          <div className="h-1.5 w-full bg-holo-vivid" />

          <button
            type="button"
            onClick={() => dismiss("close-button")}
            aria-label="Close cart reminder"
            className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-[var(--muted)] text-[var(--foreground)]/60 transition hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="px-5 pb-5 pt-5 sm:px-7 sm:pb-7 sm:pt-6">
            <div className="pr-9">
              <p className="flex items-center gap-1.5 font-pixel text-[10px] uppercase tracking-tight text-[var(--primary)]">
                <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
                Your bag is saved
              </p>
              <h2
                id="cart-recovery-title"
                className="mt-2 text-balance font-display text-2xl font-black leading-tight text-[var(--foreground)]"
              >
                Your saved bag is ready to review ✨
              </h2>
              <p
                id="cart-recovery-description"
                className="mt-1.5 text-sm leading-relaxed text-[var(--foreground)]/65"
              >
                You saved {itemCount} {itemCount === 1 ? "item" : "items"} on
                this device. We also saved your available promo for checkout.
              </p>
            </div>

            <div className="mt-4 flex gap-3 rounded-2xl border border-[var(--border)] bg-[var(--muted)]/55 p-3">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[var(--product-surface)]">
                {firstItem.imageUrl ? (
                  <Image
                    src={firstItem.imageUrl}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                ) : (
                  <span className="grid h-full place-items-center text-2xl" aria-hidden="true">
                    🛍️
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1 self-center">
                <p className="line-clamp-2 text-sm font-extrabold leading-snug">
                  {firstItem.title}
                </p>
                {variant && (
                  <p className="mt-1 line-clamp-1 text-xs text-[var(--foreground)]/55">
                    {variant}
                  </p>
                )}
                <p className="mt-1.5 text-xs font-bold text-[var(--primary)]">
                  Qty {firstItem.quantity}
                  {extraLines > 0
                    ? ` · +${extraLines} more ${extraLines === 1 ? "style" : "styles"}`
                    : ""}
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-2 rounded-2xl bg-[var(--primary-soft)]/55 px-4 py-3">
              <div className="flex items-start gap-2.5">
                {promo.bundleActive ? (
                  <Gift
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]"
                    aria-hidden="true"
                  />
                ) : (
                  <Sparkles
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]"
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    <span className="font-extrabold text-[var(--primary)]">
                      {offerLabel}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-[var(--foreground)]/55">
                    {promo.bundleActive
                      ? "Automatic bundle pricing takes priority over coupon codes."
                      : `${promo.appliedCode ?? WELCOME_COUPON.code} is saved to this bag.`}
                  </p>
                </div>
              </div>
            </div>

            <Link
              href="/cart"
              onClick={handleCheckoutClick}
              className="btn-candy-solid mt-4 flex w-full items-center justify-center gap-2 px-5 py-3.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
            >
              Review bag &amp; checkout
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => dismiss("keep-shopping")}
              className="mt-2.5 w-full rounded-full px-5 py-2 text-sm font-bold text-[var(--foreground)]/55 transition hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
            >
              Keep shopping
            </button>

            <p
              id="cart-recovery-note"
              className="mt-2 text-center text-[11px] leading-snug text-[var(--foreground)]/40"
            >
              Saved bag details are estimates. Current price, availability,
              shipping, and tax are confirmed before payment.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

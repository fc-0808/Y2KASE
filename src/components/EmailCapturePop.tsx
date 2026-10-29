"use client";

/**
 * EmailCapturePop — the welcome pop-up.
 *
 * WHAT IT SHOWS
 * The welcome offer from `@/lib/promotions` (`WELCOME_COUPON`), plus a one-line
 * reminder of the automatic bundle. The percentage is never typed here, so the
 * pop-up cannot advertise a discount checkout does not honour.
 *
 * On desktop the card is a split: the homepage hero photo fills the left,
 * and the offer stays in the right column. On a phone the same photo is a
 * short banner, so the claim button stays on screen.
 *
 * THE FLOW
 *   claim   — "Claim your 15% off", with a yes / no. The code stays hidden.
 *   email   — the address that earns the code.
 *   success — the issued code, saved to the bag and repeated on screen.
 *
 * The code is applied only after a successful subscribe. Opening the dialog
 * must not save it, or closing the first step would still discount the bag.
 *
 * WHEN IT APPEARS
 * Two triggers, whichever comes first: a short dwell on the page, or scrolling
 * a quarter of the way down it. The clock is the fallback — someone reading
 * gets the offer without having to do anything — while the scroll is the real
 * signal, because a shopper who has started moving through a page has already
 * decided the site is worth their time. A floor under the scroll trigger keeps
 * the first flick of the wheel from being read as intent.
 *
 * Then throttled to once a week, retired after two dismissals, and never shown
 * again once subscribed. A non-empty cart hands priority to the dedicated
 * recovery campaign, and the session arbiter keeps a shopper from meeting two
 * marketing dialogs back to back.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, Sparkles, Gift } from "lucide-react";
import { PromoCodeBlock } from "@/components/PromoCodeBlock";
import {
  useHasBlockingOverlay,
  useOverlayLock,
  useOverlayStore,
} from "@/lib/store/overlay";
import {
  useBodyScrollLock,
  useModalFocusTrap,
} from "@/lib/hooks/use-modal-dialog";
import { WELCOME_POPUP_POLICY } from "@/lib/marketing/popup-policy";
import { readPopupPreview } from "@/lib/marketing/popup-preview";
import {
  canClaimMarketingPopup,
  claimMarketingPopup,
  isMarketingPopupPath,
  releaseMarketingPopup,
} from "@/lib/marketing/popup-session";
import { useCart } from "@/lib/store/cart";
import { usePromoActions } from "@/lib/store/promo";
import { BUNDLE, WELCOME_COUPON, resolveLocalCoupon } from "@/lib/promotions";
import { gaEvent } from "@/lib/analytics/gtag";
import { CreateAccountInvite } from "@/components/auth/CreateAccountInvite";

const LS_KEY_SHOWN_AT = "y2k_popup_shown_at";
const LS_KEY_DISMISS_COUNT = "y2k_popup_dismiss_count";
const LS_KEY_SUBSCRIBED = "y2k_popup_subscribed";
const {
  delayMs: DELAY_MS,
  minDwellMs: MIN_DWELL_MS,
  scrollIntentRatio: SCROLL_INTENT_RATIO,
  throttleMs: THROTTLE_MS,
  maxDismissals: MAX_DISMISSALS,
} = WELCOME_POPUP_POLICY;

/**
 * The shortest wait this dialog will ever schedule.
 *
 * The dwell clock runs from arrival, not from the last time the trigger effect
 * re-ran, so a shopper who opened and closed the cart drawer can come back
 * already past due. Landing a modal in the same frame as the panel they just
 * dismissed reads as a glitch, so a past-due open still waits a beat.
 */
const RESUME_GRACE_MS = 600;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** GA4 promotion identity — keeps the modal's funnel separable from the
 *  /welcome-gift landing page, which advertises the same offer at length. */
const PROMOTION = {
  promotion_id: "welcome_popup",
  promotion_name: `Welcome pop-up — ${WELCOME_COUPON.label}`,
  creative_slot: "site_modal",
} as const;

/**
 * Is this a QA preview rather than a real shopper visit?
 *
 * Development only, and parsed by `@/lib/marketing/popup-preview` so this
 * dialog and cart recovery cannot disagree about which mode a URL requests.
 *
 * A preview deliberately leaves the frequency-capping counters alone. Otherwise
 * opening it to check the copy would burn the once-a-week throttle and the
 * two-dismissal cap, and previewing the pop-up would be the fastest way to stop
 * being able to preview the pop-up.
 */
function isPreview(): boolean {
  return readPopupPreview() === "welcome";
}

function readStoredNumber(key: string): number {
  try {
    const value = Number.parseInt(localStorage.getItem(key) ?? "0", 10);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

type PopupState = "hidden" | "claim" | "email" | "success";

export function EmailCapturePop() {
  const [state, setState] = useState<PopupState>("hidden");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [alreadyMember, setAlreadyMember] = useState(false);
  /** Whether the welcome email actually left Resend. The code is on screen
   *  either way, so a failed send costs the shopper nothing — but promising an
   *  inbox delivery that never happened would. */
  const [emailed, setEmailed] = useState(false);
  const [code, setCode] = useState(WELCOME_COUPON.code);
  /** Set only by the API, which is the authority on what it issued. */
  const [percentOff, setPercentOff] = useState<number | null>(null);
  /** Read once, so the override survives a client navigation that drops the
   *  query string — you can open it, browse, and still be in preview mode. */
  const [preview] = useState(isPreview);

  const dialogRef = useRef<HTMLDivElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const openAttemptedRef = useRef(false);
  const dwellStartedAtRef = useRef(0);
  const submitAbortRef = useRef<AbortController | null>(null);

  const { autoApply } = usePromoActions();
  const hasCartItems = useCart((cart) => cart.items.length > 0);
  const cartOpen = useCart((cart) => cart.isOpen);
  const blockingOverlay = useHasBlockingOverlay();
  const pathname = usePathname();
  const previousPathRef = useRef(pathname);
  const isOpen = state !== "hidden";

  useOverlayLock("email-capture", isOpen);
  useBodyScrollLock(isOpen);

  const dismiss = useCallback(() => {
    submitAbortRef.current?.abort();
    submitAbortRef.current = null;

    if (!preview) {
      try {
        const prev = readStoredNumber(LS_KEY_DISMISS_COUNT);
        localStorage.setItem(LS_KEY_DISMISS_COUNT, String(prev + 1));
      } catch {
        // Storage can be unavailable in privacy-restricted browsers.
      }
      gaEvent("popup_dismiss", { ...PROMOTION, popup_stage: state });
    }
    setState("hidden");
  }, [preview, state]);
  useModalFocusTrap(dialogRef, isOpen, dismiss, state);

  // The trap parks focus on the dialog when the step changes. The email field
  // is the thing the shopper came to this step to fill, so it takes over.
  useEffect(() => {
    if (state !== "email") return;
    emailInputRef.current?.focus();
  }, [state]);

  // Dwell is measured per page, from arrival. Declared ahead of the trigger
  // effect so the clock is always set before anything reads it.
  useEffect(() => {
    dwellStartedAtRef.current = Date.now();
  }, [pathname]);

  // Stamp the moment the dialog leaves the screen — the session handover for
  // cart recovery is measured from there. Watching the flag rather than
  // wiring each button covers every close path there is: the X, the backdrop,
  // Escape, the success CTA, and a navigation that closes it for the shopper.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    if (!preview) releaseMarketingPopup("welcome");
  }, [isOpen, preview]);

  useEffect(() => {
    const pathnameChanged = previousPathRef.current !== pathname;
    previousPathRef.current = pathname;
    if (!pathnameChanged && isMarketingPopupPath(pathname)) return;
    submitAbortRef.current?.abort();
    submitAbortRef.current = null;
    setState("hidden");
  }, [pathname]);

  useEffect(
    () => () => {
      submitAbortRef.current?.abort();
    },
    [],
  );

  /**
   * Show the pop-up, if it is still the right thing to do.
   *
   * Both triggers funnel through here, and everything the impression implies —
   * claiming the session slot, banking the offer, stamping the throttle,
   * reporting it — happens together rather than trailing behind in a follow-up
   * effect, so the pop-up cannot end up on screen having done only some of it.
   */
  const attemptOpen = useCallback(() => {
    if (openAttemptedRef.current) return;

    if (!preview) {
      // Read the stores synchronously here. A timer or a scroll handler can
      // land in the same tick as add-to-cart or another overlay's claim, and
      // React effect cleanup does not run soon enough to have stopped it.
      const liveCart = useCart.getState();
      const overlayActive = useOverlayStore.getState().active.length > 0;
      if (
        !isMarketingPopupPath(window.location.pathname) ||
        liveCart.items.length > 0 ||
        liveCart.isOpen ||
        overlayActive ||
        !claimMarketingPopup("welcome")
      ) {
        return;
      }
    }
    openAttemptedRef.current = true;

    setState("claim");

    if (preview) return;
    try {
      localStorage.setItem(LS_KEY_SHOWN_AT, String(Date.now()));
    } catch {
      // The session claim still prevents repeated dialogs in this lifecycle.
    }
    gaEvent("view_promotion", PROMOTION);
  }, [preview]);

  // Arm the triggers. Eligibility is re-checked whenever the shopper's state
  // changes, so a bag filled mid-countdown stands the campaign down and hands
  // the session to cart recovery.
  useEffect(() => {
    if (openAttemptedRef.current) return;

    if (preview) {
      const immediate = window.setTimeout(attemptOpen, 0);
      return () => window.clearTimeout(immediate);
    }

    // Recovery owns cart-bearing sessions. This also stops two independent
    // marketing surfaces from racing for the same shopper's attention.
    if (
      !isMarketingPopupPath(pathname) ||
      hasCartItems ||
      cartOpen ||
      blockingOverlay ||
      !canClaimMarketingPopup("welcome")
    ) {
      return;
    }

    try {
      if (localStorage.getItem(LS_KEY_SUBSCRIBED) === "1") return;

      const dismissCount = readStoredNumber(LS_KEY_DISMISS_COUNT);
      if (dismissCount >= MAX_DISMISSALS) return;

      const lastShownAt = readStoredNumber(LS_KEY_SHOWN_AT);
      if (Date.now() - lastShownAt < THROTTLE_MS) return;
    } catch {
      // Continue with the in-memory session claim when storage is blocked.
    }

    const dwell = () => Date.now() - dwellStartedAtRef.current;
    const timer = window.setTimeout(
      attemptOpen,
      Math.max(RESUME_GRACE_MS, DELAY_MS - dwell()),
    );

    // Scroll depth is the better signal, so it short-circuits the clock. The
    // measurement is coalesced into an animation frame because `scrollHeight`
    // is a layout read, and one per frame is the most a scroll handler may
    // ever cost.
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (dwell() < MIN_DWELL_MS) return;

      const scrollable =
        document.documentElement.scrollHeight - window.innerHeight;
      // A page with nothing to scroll cannot express intent this way; the
      // clock above is the whole trigger there.
      if (scrollable <= 0) return;
      if (window.scrollY / scrollable < SCROLL_INTENT_RATIO) return;
      attemptOpen();
    };
    const onScroll = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(measure);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.clearTimeout(timer);
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [
    attemptOpen,
    blockingOverlay,
    cartOpen,
    hasCartItems,
    pathname,
    preview,
  ]);

  function handleClaim() {
    setError("");
    setState("email");
    if (!preview) {
      gaEvent("select_promotion", { ...PROMOTION, popup_stage: "claim" });
    }
  }

  function handleBackToClaim() {
    setError("");
    setState("claim");
  }

  function handleCopy() {
    if (!preview) gaEvent("select_promotion", PROMOTION);
  }

  function handleEmailChange(next: string) {
    setEmail(next);
    if (error) setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }
    setError("");
    setLoading(true);
    submitAbortRef.current?.abort();
    const controller = new AbortController();
    submitAbortRef.current = controller;

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, source: "popup" }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (controller.signal.aborted) return;

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      const issued: string = data.code ?? WELCOME_COUPON.code;
      const returning = Boolean(data.alreadySubscribed);

      autoApply(issued, "welcome-popup");
      setCode(issued);
      setPercentOff(
        typeof data.percentOff === "number" ? data.percentOff : null,
      );
      setAlreadyMember(returning);
      setEmailed(Boolean(data.emailed));
      setState("success");

      if (!preview) {
        try {
          localStorage.setItem(LS_KEY_SUBSCRIBED, "1");
        } catch {
          // The successful server-side subscription remains authoritative.
        }
        // Only count net-new signups as conversions — re-submits are acknowledgement.
        if (!returning) gaEvent("generate_lead", { method: "welcome_popup" });
      }
    } catch (submitError) {
      if (
        controller.signal.aborted ||
        (submitError instanceof DOMException &&
          submitError.name === "AbortError")
      ) {
        return;
      }
      setError("Connection error. Please try again.");
    } finally {
      if (submitAbortRef.current === controller) {
        submitAbortRef.current = null;
        setLoading(false);
      }
    }
  }

  if (!isOpen) return null;

  const shown = resolveLocalCoupon(code) ?? WELCOME_COUPON;
  const offerPercent = percentOff ?? shown.percentOff;
  const codeBanner = `Your ${offerPercent}% Off Code`;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm animate-float-up"
        aria-hidden="true"
        onClick={dismiss}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="popup-title"
        tabIndex={-1}
        className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[51] mx-auto max-h-[min(100dvh-2rem,calc(100svh-2rem))] max-w-md overflow-y-auto overscroll-contain focus:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 md:w-[min(52rem,calc(100vw-3rem))] md:max-w-none"
      >
        <div className="card-cute relative overflow-hidden animate-float-up md:flex md:min-h-[min(32rem,calc(100dvh-4.5rem))] md:flex-row md:items-stretch">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1.5 bg-holo-vivid md:h-2"
            aria-hidden="true"
          />

          <div
            className="relative h-32 w-full shrink-0 overflow-hidden sm:h-36 md:h-auto md:w-[42%] md:self-stretch"
            aria-hidden="true"
          >
            <Image
              src="/brand/hero-2.webp"
              alt=""
              fill
              sizes="(min-width: 768px) 380px, 100vw"
              className="object-cover object-[22%_center] md:origin-[34%_70%] md:scale-[1.08]"
            />
          </div>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-[var(--foreground)]/60 shadow-sm backdrop-blur-sm transition hover:bg-white hover:text-[var(--primary)] md:right-4 md:top-4 md:h-10 md:w-10"
          >
            <X className="h-4 w-4 md:h-[18px] md:w-[18px]" />
          </button>

          <div className="px-6 pb-5 pt-5 sm:px-8 sm:pb-6 sm:pt-6 md:flex md:min-w-0 md:flex-1 md:flex-col md:justify-center md:px-8 md:pb-9 md:pt-8 lg:px-10 lg:pb-10 lg:pt-9">
            {state === "claim" && (
              <div className="text-center">
                <p className="font-pixel text-[10px] uppercase tracking-tight text-[var(--primary)] md:text-[11px]">
                  Welcome
                </p>
                <h2
                  id="popup-title"
                  className="mt-2 text-balance font-display text-[1.65rem] font-black leading-tight text-[var(--foreground)] sm:text-[1.85rem] md:mt-3 md:text-[2.15rem] md:leading-[1.05] lg:text-[2.45rem]"
                >
                  Claim your {WELCOME_COUPON.percentOff}% off
                </h2>
                <p className="mx-auto mt-2 max-w-[16rem] text-sm leading-snug text-[var(--foreground)]/65 md:mt-3 md:max-w-sm md:text-base md:leading-relaxed">
                  Your code arrives by email.
                </p>

                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[var(--muted)] px-3.5 py-2.5 text-left md:mt-7 md:gap-4 md:px-4 md:py-3.5">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-holo text-[var(--primary)] md:h-11 md:w-11 md:rounded-2xl"
                    aria-hidden="true"
                  >
                    <Gift className="h-4 w-4 md:h-5 md:w-5" />
                  </span>
                  <p className="min-w-0 text-[13px] font-bold leading-snug text-[var(--foreground)] md:text-[15px]">
                    {BUNDLE.label}
                    <span className="mt-0.5 block text-[11px] font-semibold text-[var(--foreground)]/45 md:text-xs">
                      Automatic on {BUNDLE.groupSize} items. Can’t be combined.
                    </span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleClaim}
                  className="btn-candy-solid mt-4 inline-flex w-full items-center justify-center gap-1.5 py-3 text-sm md:mt-7 md:gap-2 md:py-3.5 md:text-base"
                >
                  Yes, claim it
                  <Sparkles className="h-3.5 w-3.5 md:h-4 md:w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="mt-1.5 w-full rounded-full px-5 py-2 text-sm font-bold text-[var(--foreground)]/50 transition hover:bg-[var(--muted)] hover:text-[var(--foreground)] md:mt-2 md:py-2.5 md:text-[15px]"
                >
                  No thanks
                </button>
              </div>
            )}

            {state === "email" && (
              <>
                <div className="mb-4 text-center md:mb-6">
                  <p className="font-pixel text-[10px] uppercase tracking-tight text-[var(--primary)] md:text-[11px]">
                    {WELCOME_COUPON.percentOff}% off
                  </p>
                  <h2
                    id="popup-title"
                    className="mt-2 text-balance font-display text-2xl font-black leading-tight text-[var(--foreground)] md:mt-3 md:text-[2.15rem] md:leading-[1.05] lg:text-[2.45rem]"
                  >
                    Enter your email
                  </h2>
                  <p className="mt-1.5 text-sm leading-snug text-[var(--foreground)]/65 md:mt-3 md:text-base md:leading-relaxed">
                    We’ll send your code.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-2 md:space-y-3" noValidate>
                  <div>
                    <label
                      htmlFor="popup-email"
                      className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50 md:mb-1.5 md:text-[13px]"
                    >
                      Email
                    </label>
                    <input
                      ref={emailInputRef}
                      id="popup-email"
                      type="email"
                      value={email}
                      onChange={(e) => handleEmailChange(e.target.value)}
                      placeholder="you@example.com"
                      required
                      autoComplete="email"
                      inputMode="email"
                      aria-invalid={error ? true : undefined}
                      aria-describedby={
                        error ? "popup-email-error" : "popup-email-note"
                      }
                      className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 md:rounded-2xl md:px-4 md:py-3.5 md:text-base"
                    />
                  </div>

                  {error && (
                    <p
                      id="popup-email-error"
                      role="alert"
                      className="text-xs font-semibold text-red-500"
                    >
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !email.trim()}
                    className="btn-candy-solid w-full py-3 text-sm md:py-3.5 md:text-base"
                  >
                    {loading ? "Sending…" : "Get my code"}
                  </button>

                  <p
                    id="popup-email-note"
                    className="pt-0.5 text-center text-[11px] leading-snug text-[var(--foreground)]/40 md:pt-1 md:text-xs md:leading-relaxed"
                  >
                    Marketing emails only. Unsubscribe anytime.
                    <br />
                    <Link href="/policies/privacy-policy" className="underline">
                      Privacy Policy
                    </Link>
                  </p>
                </form>

                <button
                  type="button"
                  onClick={handleBackToClaim}
                  className="mt-1 w-full rounded-full px-5 py-2 text-sm font-bold text-[var(--foreground)]/50 transition hover:bg-[var(--muted)] hover:text-[var(--foreground)] md:mt-2 md:py-2.5 md:text-[15px]"
                >
                  Back
                </button>
              </>
            )}

            {state === "success" && (
              <div role="status" className="py-1 text-center md:py-0">
                <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-soft)] md:mb-4 md:h-16 md:w-16">
                  <Sparkles className="h-7 w-7 text-[var(--primary)] md:h-8 md:w-8" />
                </div>
                <h2
                  id="popup-title"
                  className="mb-1.5 text-balance font-display text-2xl font-black text-[var(--foreground)] md:mb-2 md:text-[2.5rem] md:leading-[1.05]"
                >
                  {alreadyMember ? "Welcome back" : "You’re in"}
                </h2>
                <p className="mb-4 text-sm leading-snug text-[var(--foreground)]/65 md:mb-5 md:text-base md:leading-relaxed">
                  {alreadyMember
                    ? "Your code is saved to your bag."
                    : emailed
                      ? "Your code is saved, and a copy is in your inbox."
                      : "Your code is saved to your bag. Copy it before you close this."}
                </p>

                <p className="mb-2 font-pixel text-[11px] font-bold uppercase tracking-tight text-[var(--primary)] sm:text-xs md:mb-3 md:text-[13px]">
                  {codeBanner}
                </p>
                <PromoCodeBlock
                  code={code}
                  onCopy={handleCopy}
                  hideEyebrow
                  compact
                />

                <Link
                  href="/products"
                  onClick={dismiss}
                  className="btn-candy-solid mt-4 inline-block px-8 py-3 text-sm md:mt-6 md:px-10 md:py-3.5 md:text-base"
                >
                  Shop now
                </Link>
                <CreateAccountInvite email={email} className="mt-4 text-center text-[13px] leading-snug text-[var(--foreground)]/65 md:mt-5 md:text-sm md:leading-relaxed" />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

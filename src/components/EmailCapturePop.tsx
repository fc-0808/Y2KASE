"use client";

/**
 * EmailCapturePop — the welcome pop-up.
 *
 * WHAT IT SHOWS
 * The two promotions the storefront actually runs, stated plainly:
 *   1. Buy 2, Get 2 Free — automatic at 4 units, no code.
 *   2. BESTIE10 — 10% off, handed over on sight and saved to the bag.
 * Both are read from `@/lib/promotions`, so the pop-up cannot advertise a
 * label, a group size or a percentage that checkout does not honour.
 *
 * WHY THE CODE IS NOT GATED
 * It is already given away unconditionally on /welcome-gift, and a "discount"
 * the shopper can reach by closing the modal and clicking a footer link is not
 * something an email address can be charged for. Pretending otherwise reads as
 * a toll booth in front of an open gate. So the code is handed over first, and
 * the address is asked for on the strength of what it actually buys: early
 * access to drops, restock alerts, member-only offers, and a copy of the code
 * in an inbox where it will still be findable next week.
 *
 * That is the same order of operations as /welcome-gift — offer first, ask
 * second — and this pop-up is deliberately its smaller sibling rather than a
 * competing pitch.
 *
 * THE FLOW
 *   offer   — both promotions, the copyable code, then the membership ask.
 *   success — membership confirmed, with the code repeated for convenience.
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
  promotion_name: "Welcome pop-up — Buy 2 Get 2 Free + BESTIE10",
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

type PopupState = "hidden" | "offer" | "success";

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

    autoApply(WELCOME_COUPON.code, "welcome-popup");
    setState("offer");

    if (preview) return;
    try {
      localStorage.setItem(LS_KEY_SHOWN_AT, String(Date.now()));
    } catch {
      // The session claim still prevents repeated dialogs in this lifecycle.
    }
    gaEvent("view_promotion", PROMOTION);
  }, [autoApply, preview]);

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
        className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[51] mx-auto max-h-[min(100dvh-2rem,calc(100svh-2rem))] max-w-md overflow-y-auto overscroll-contain focus:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2"
      >
        <div className="card-cute relative overflow-hidden animate-float-up">
          <div className="h-1.5 w-full bg-holo-vivid" />

          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-[var(--muted)] text-[var(--foreground)]/60 hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] transition"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="px-6 pb-5 pt-5 sm:px-8 sm:pb-6 sm:pt-6">
            {state === "offer" && (
              <>
                <div className="mb-3 text-center">
                  <p className="font-pixel text-[10px] uppercase tracking-tight text-[var(--primary)]">
                    Join the club
                  </p>
                  <h2
                    id="popup-title"
                    className="mt-1.5 text-balance font-display text-[1.35rem] font-black leading-tight text-[var(--foreground)] sm:text-2xl"
                  >
                    Two ways to save today ✨
                  </h2>
                </div>

                <section aria-labelledby="popup-code-banner">
                  <p
                    id="popup-code-banner"
                    className="mb-1.5 text-center font-pixel text-[11px] font-bold uppercase tracking-tight text-[var(--primary)] sm:text-xs"
                  >
                    {codeBanner}
                  </p>
                  <PromoCodeBlock
                    code={code}
                    onCopy={handleCopy}
                    hideEyebrow
                    compact
                  />
                </section>

                <section
                  className="mt-2.5"
                  aria-labelledby="popup-bundle-label"
                >
                  <div className="flex items-center gap-3 rounded-2xl bg-[var(--muted)] px-3.5 py-2.5">
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-holo text-[var(--primary)]"
                      aria-hidden="true"
                    >
                      <Gift className="h-4 w-4" />
                    </span>
                    <p
                      id="popup-bundle-label"
                      className="min-w-0 text-[13px] font-bold leading-snug text-[var(--foreground)]"
                    >
                      {BUNDLE.label}
                    </p>
                  </div>
                </section>

                <p
                  id="popup-stacking-note"
                  className="mt-2 text-center text-[11px] leading-snug text-[var(--foreground)]/45"
                >
                  Bundle pricing and coupons cannot stack — checkout applies the
                  offer your bag qualifies for.
                </p>

                <hr className="my-3 border-t border-[var(--border)]" />

                <p
                  id="popup-email-pitch"
                  className="text-center text-[13px] font-semibold leading-snug text-[var(--foreground)]/70"
                >
                  Plus, get early access, restocks &amp; offers in your inbox!
                </p>

                <form
                  onSubmit={handleSubmit}
                  className="mt-2 space-y-2"
                  noValidate
                  aria-describedby="popup-stacking-note popup-email-pitch"
                >
                  <div>
                    <label
                      htmlFor="popup-email"
                      className="mb-0.5 block text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50"
                    >
                      Your Email:
                    </label>
                    <input
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
                        error ? "popup-email-error" : undefined
                      }
                      className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
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
                    className="btn-candy-solid w-full py-3 text-sm"
                  >
                    {loading ? "Joining…" : "Join the Club ✨"}
                  </button>

                  <p className="pt-0.5 text-center text-[11px] leading-snug text-[var(--foreground)]/40">
                    By joining, you agree to receive marketing emails. Unsubscribe
                    anytime. See our{" "}
                    <Link href="/policies/privacy-policy" className="underline">
                      Privacy Policy
                    </Link>
                    .
                  </p>
                </form>
              </>
            )}

            {state === "success" && (
              <div role="status" className="py-2 text-center">
                <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary-soft)]">
                  <Sparkles className="h-8 w-8 text-[var(--primary)]" />
                </div>
                <h2
                  id="popup-title"
                  className="mb-2 text-balance font-display text-2xl font-black text-[var(--foreground)]"
                >
                  {alreadyMember
                    ? "Welcome back, bestie! 💕"
                    : "You're in, bestie! 🎉"}
                </h2>
                <p className="mb-5 text-sm leading-relaxed text-[var(--foreground)]/65">
                  {alreadyMember
                    ? "You're already on the VIP list — we'll keep the good stuff coming. 💌"
                    : emailed
                      ? "Check your inbox 💌 Your code is in there, along with first dibs on every new drop."
                      : "First dibs on every new drop are on their way. Here's your code again — copy it before you close this. 💾"}
                </p>

                <p className="mb-2 font-pixel text-[11px] font-bold uppercase tracking-tight text-[var(--primary)] sm:text-xs">
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
                  className="btn-candy-solid mt-5 inline-block px-8 py-3 text-sm"
                >
                  Shop Now ✨
                </Link>
                <CreateAccountInvite email={email} className="mt-4 text-center text-[13px] leading-snug text-[var(--foreground)]/65" />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

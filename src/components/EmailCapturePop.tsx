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
 * Frequency: shown 3 s into the first visit, then throttled to once a week,
 * retired after two dismissals, and never shown again once subscribed.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X, Sparkles, Gift } from "lucide-react";
import { PromoCodeBlock } from "@/components/PromoCodeBlock";
import { useOverlayLock } from "@/lib/store/overlay";
import { usePromoActions } from "@/lib/store/promo";
import { BUNDLE, WELCOME_COUPON, resolveLocalCoupon } from "@/lib/promotions";
import { gaEvent } from "@/lib/analytics/gtag";

const LS_KEY_SHOWN_AT = "y2k_popup_shown_at";
const LS_KEY_DISMISS_COUNT = "y2k_popup_dismiss_count";
const LS_KEY_SUBSCRIBED = "y2k_popup_subscribed";
const THROTTLE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_DISMISSALS = 2; // hide forever after closing twice
const DELAY_MS = 3_000; // show after 3 s

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Elements the focus trap may land on. Disabled controls are unfocusable, so
 *  including them would let Tab escape the moment the submit button greys out. */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** GA4 promotion identity — keeps the modal's funnel separable from the
 *  /welcome-gift landing page, which advertises the same offer at length. */
const PROMOTION = {
  promotion_id: "welcome_popup",
  promotion_name: "Welcome pop-up — Buy 2 Get 2 Free + BESTIE10",
  creative_slot: "site_modal",
} as const;

/** Query flag that forces the pop-up open for QA, e.g. `/products?popup=1`. */
const PREVIEW_PARAM = "popup";

/**
 * Is this a QA preview rather than a real shopper visit?
 *
 * Development only — `process.env.NODE_ENV` is inlined at build time, so this
 * collapses to `false` and the whole override drops out of production bundles.
 *
 * A preview deliberately leaves the frequency-capping counters alone. Otherwise
 * opening it to check the copy would burn the once-a-week throttle and the
 * two-dismissal cap, and previewing the pop-up would be the fastest way to stop
 * being able to preview the pop-up.
 */
function isPreview(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has(PREVIEW_PARAM);
}

/** Lock page scroll while the modal is open; compensate for scrollbar width. */
function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPadding = document.body.style.paddingRight;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPadding;
    };
  }, [active]);
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

  const { autoApply } = usePromoActions();
  const isOpen = state !== "hidden";

  useOverlayLock("email-capture", isOpen);
  useBodyScrollLock(isOpen);

  const dismiss = useCallback(() => {
    if (!preview) {
      const prev = parseInt(
        localStorage.getItem(LS_KEY_DISMISS_COUNT) ?? "0",
        10,
      );
      localStorage.setItem(LS_KEY_DISMISS_COUNT, String(prev + 1));
      gaEvent("popup_dismiss", { ...PROMOTION, popup_stage: state });
    }
    setState("hidden");
  }, [preview, state]);

  // Decide whether to show the pop-up. The offer is banked inside the timer
  // rather than in a follow-up effect so opening, applying and reporting happen
  // exactly once, in one place.
  useEffect(() => {
    if (!preview) {
      if (localStorage.getItem(LS_KEY_SUBSCRIBED) === "1") return;

      const dismissCount = parseInt(
        localStorage.getItem(LS_KEY_DISMISS_COUNT) ?? "0",
        10,
      );
      if (dismissCount >= MAX_DISMISSALS) return;

      const lastShownAt = parseInt(
        localStorage.getItem(LS_KEY_SHOWN_AT) ?? "0",
        10,
      );
      if (Date.now() - lastShownAt < THROTTLE_MS) return;
    }

    const timer = window.setTimeout(() => {
      autoApply(WELCOME_COUPON.code, "welcome-popup");
      setState("offer");

      if (preview) return;
      localStorage.setItem(LS_KEY_SHOWN_AT, String(Date.now()));
      gaEvent("view_promotion", PROMOTION);
    }, preview ? 0 : DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [autoApply, preview]);

  // Move focus into the dialog on open and hand it back on close. The email
  // field is deliberately NOT auto-focused: it is the last thing on this screen,
  // and raising the mobile keyboard would bury the offer we just made.
  useEffect(() => {
    if (!isOpen) return;
    const restoreTo = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (restoreTo instanceof HTMLElement) restoreTo.focus();
    };
  }, [isOpen]);

  // Trap focus inside the dialog while open.
  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        dismiss();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;

      const focusable =
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || active === dialogRef.current) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, dismiss]);

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

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, source: "popup" }),
      });
      const data = await res.json();

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
        localStorage.setItem(LS_KEY_SUBSCRIBED, "1");
        // Only count net-new signups as conversions — re-submits are acknowledgement.
        if (!returning) gaEvent("sign_up", { method: "welcome_popup" });
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
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
        className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[51] mx-auto max-h-[min(100dvh-2rem,calc(100svh-2rem))] max-w-md overflow-y-auto animate-float-up overscroll-contain focus:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2"
      >
        <div className="card-cute relative overflow-hidden">
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
                  The best discount combination will be automatically applied at
                  checkout.
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
                    No spam, unsubscribe anytime. See our{" "}
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
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

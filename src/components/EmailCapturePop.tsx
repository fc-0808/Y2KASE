"use client";

/**
 * EmailCapturePop — the welcome pop-up, as a scratch card.
 *
 * WHY IT IS A GAME NOW
 * The announcement bar advertises BESTIE10 on every page. A pop-up offering
 * BESTIE10 for an email address is therefore asking to be paid for something
 * already lying on the floor, and the honest version of that ask converts
 * badly for good reason. The scratch card fixes the economics: it pays out a
 * subscriber-only tier that always beats the public 10%, so the address buys a
 * genuinely better price. The game is what makes the exchange feel like a gift
 * rather than a toll.
 *
 * THE FLOW
 *   scratch  — foil over an unknown prize. The draw is requested from the
 *              server on FIRST CONTACT, not on open: a visitor who never plays
 *              never has a cookie set for them.
 *   claim    — the prize is revealed; the email buys the code that pays it.
 *   success  — the code, copyable, and already applied to the bag.
 *
 * WHO DECIDES THE PRIZE
 * Not this file. `/api/scratch` draws it and signs it into an httpOnly cookie;
 * `/api/subscribe` re-reads that cookie to decide which code to issue. Nothing
 * here can influence the outcome, which is exactly the point — the reveal is
 * animation over a decision that was already made and recorded.
 *
 * The public 10% is still applied to the bag silently when the pop-up opens,
 * so walking away from the game costs the shopper nothing. `autoApply` never
 * downgrades, so winning a better tier later cleanly replaces it.
 *
 * Frequency: shown 3 s into the first visit, then throttled to once a week,
 * retired after two dismissals, and never shown again once subscribed.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X, Sparkles, Gift } from "lucide-react";
import { PromoCodeBlock } from "@/components/PromoCodeBlock";
import { ScratchCard } from "@/components/ScratchCard";
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

/** GA4 promotion identity — keeps the scratch card's funnel separable from the
 *  /welcome-gift landing page, which advertises the plain public offer. */
const PROMOTION = {
  promotion_id: "welcome_scratch",
  promotion_name: "Welcome scratch card — subscriber-only discount",
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

type PopupState = "hidden" | "scratch" | "prize" | "claim" | "success";

/** The three states that render the card. Used to key the header copy. */
type CardStage = Extract<PopupState, "scratch" | "prize" | "claim">;

/**
 * Header copy per stage.
 *
 * A lookup rather than nested ternaries in the JSX: with three stages the
 * conditional version becomes unreadable, and having every screen's wording
 * side by side is what makes duplicated phrasing obvious.
 *
 * `narrow` caps the heading at two balanced lines. The claim heading is short
 * enough for one row and is left unconstrained.
 */
const STAGE_COPY: Record<
  CardStage,
  { eyebrow: string; title: string; narrow: boolean }
> = {
  scratch: {
    eyebrow: "Exclusive only",
    title: "Scratch to reveal a secret offer 🎁",
    narrow: true,
  },
  prize: {
    eyebrow: "Nice scratch",
    title: "Your secret offer is ready 🎉",
    narrow: true,
  },
  claim: {
    eyebrow: "Last step",
    title: "Where should we send it?",
    narrow: false,
  },
};

export function EmailCapturePop() {
  const [state, setState] = useState<PopupState>("hidden");
  /** The won discount, known only after the email is accepted. */
  const [percentOff, setPercentOff] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [alreadyMember, setAlreadyMember] = useState(false);
  /** Whether the welcome email actually left Resend. The code is on screen
   *  either way, so a failed send costs the shopper nothing — but promising an
   *  inbox delivery that never happened would. */
  const [emailed, setEmailed] = useState(false);
  const [code, setCode] = useState(WELCOME_COUPON.code);
  /** False only when a better code already owns the bag — the copy must not
   *  claim an apply that did not happen. */
  const [savedToBag, setSavedToBag] = useState(false);
  /** Read once, so the override survives a client navigation that drops the
   *  query string — you can open it, browse, and still be in preview mode. */
  const [preview] = useState(isPreview);

  const dialogRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const drawRequested = useRef(false);

  const { autoApply } = usePromoActions();
  const isOpen = state !== "hidden";

  // On mobile this modal is anchored bottom-centre, exactly where the support
  // launcher lives. Claim the lock so only one of them is ever on screen.
  useOverlayLock("email-capture", isOpen);

  const dismiss = useCallback(() => {
    if (!preview) {
      const prev = parseInt(localStorage.getItem(LS_KEY_DISMISS_COUNT) ?? "0", 10);
      localStorage.setItem(LS_KEY_DISMISS_COUNT, String(prev + 1));
    }
    setState("hidden");
  }, [preview]);

  /**
   * Have the server draw and record this visitor's prize.
   *
   * Fire-and-forget: the response carries no prize information, so there is
   * nothing to wait for and nothing to render from it. The draw is idempotent
   * on the client (the ref) and on the server (the signed cookie), so a frantic
   * scratcher and a page reload both land on the same tier.
   *
   * Failures are swallowed on purpose. If this never lands, /api/subscribe finds
   * no cookie and issues the public coupon instead — a smaller real discount,
   * rather than an error in front of someone who just played a game.
   */
  const requestDraw = useCallback(async () => {
    if (drawRequested.current) return;
    drawRequested.current = true;
    try {
      await fetch("/api/scratch", { method: "POST" });
    } catch {
      // Deliberately ignored — see above.
    }
  }, []);

  // Decide whether to show the pop-up. The baseline offer is banked inside the
  // timer rather than in a follow-up effect so opening, applying and reporting
  // happen exactly once, in one place.
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

    // Preview still goes through the timer (at 0 ms) so there is exactly one
    // reveal path and one cleanup path, and no state is set during the effect.
    const timer = window.setTimeout(() => {
      // Bank the public offer immediately. Whatever happens next — scratch,
      // ignore, close — the shopper is never worse off than the banner.
      const outcome = autoApply(WELCOME_COUPON.code, "welcome-popup");
      setSavedToBag(outcome === "applied" || outcome === "already-saved");
      setState("scratch");

      if (preview) return;
      localStorage.setItem(LS_KEY_SHOWN_AT, String(Date.now()));
      gaEvent("view_promotion", PROMOTION);
    }, preview ? 0 : DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [autoApply, preview]);

  // Move focus into the dialog on open and hand it back on close. The email
  // field is deliberately NOT auto-focused: it is not the first action here,
  // and raising the mobile keyboard would bury the card.
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

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      // The dialog itself holds focus on open, and it sits *before* everything
      // inside it — so shift-tabbing off it would walk straight out to the page
      // behind. Treat it as the leading edge and wrap.
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

  // Once they've clicked through to the form there is exactly one thing left to
  // do, so put the cursor in it. Raising the mobile keyboard is welcome here —
  // unlike the scratch screen, nothing behind it needs reading, and they
  // arrived by deliberately pressing "Claim".
  useEffect(() => {
    if (state !== "claim") return;
    emailRef.current?.focus();
  }, [state]);

  /** Foil is off. Lands on the prize, not on a form — the ask comes next. */
  function handleReveal() {
    // Covers the accessible reveal button, which skips the scratch entirely and
    // so would otherwise never have triggered the draw.
    void requestDraw();
    setState("prize");
    if (!preview) gaEvent("select_promotion", PROMOTION);
  }

  /**
   * They asked for the prize. This deliberate step is the point of the whole
   * screen: a small voluntary "claim" converts an offer that merely exists into
   * one they have taken possession of, and people finish forms for things they
   * already feel they own. It also keeps the delight beat and the ask from
   * landing in the same instant, which is what made the reveal feel
   * transactional when the form appeared alongside it.
   */
  function handleClaim() {
    setState("claim");
    // Its own event so the added step is measurable: the funnel is now
    // view_promotion → select_promotion (scratched) → scratch_claim → sign_up,
    // and the drop-off between the last two is the whole question this step
    // raises.
    if (!preview) gaEvent("scratch_claim", PROMOTION);
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
        body: JSON.stringify({ email: trimmed, source: "scratch" }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      // The server decides which code pays out the prize, from its own signed
      // cookie. Take what it issued rather than anything guessed here. This is
      // also the first moment the discount exists on the client at all.
      const issued: string = data.code ?? WELCOME_COUPON.code;
      const outcome = autoApply(issued, "welcome-popup");
      setSavedToBag(outcome === "applied" || outcome === "already-saved");
      setCode(issued);
      setPercentOff(
        typeof data.percentOff === "number" ? data.percentOff : null,
      );
      setAlreadyMember(Boolean(data.alreadySubscribed));
      setEmailed(Boolean(data.emailed));
      setState("success");
      // NB: a preview submit still really subscribes (the API is live) — it
      // just doesn't retire the pop-up, so the flow stays repeatable.
      if (!preview) localStorage.setItem(LS_KEY_SUBSCRIBED, "1");
      gaEvent("sign_up", { method: "welcome_scratch" });
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  // Read the percentage off the code actually on screen, not the local
  // constant: after a signup the API is the authority on what was issued, and
  // fine print that disagrees with the code above it is the kind of detail that
  // turns into a support ticket.
  // Prefer the percentage the API reported: it is the authority on what it
  // issued. The local catalogue is only a fallback for a response that somehow
  // arrives without one.
  const shown = resolveLocalCoupon(code) ?? WELCOME_COUPON;
  const revealedPercent = percentOff ?? shown.percentOff;
  // Narrowed so STAGE_COPY can be indexed without re-testing inside the JSX.
  const stage: CardStage | null =
    state === "scratch" || state === "prize" || state === "claim"
      ? state
      : null;
  const codeNote = `${revealedPercent}% off · ${
    savedToBag ? "Applied to your bag ✨" : "Enter at checkout"
  }`;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm animate-float-up"
        aria-hidden="true"
        onClick={dismiss}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="popup-title"
        tabIndex={-1}
        className="fixed inset-x-4 bottom-4 z-50 mx-auto max-h-[calc(100svh-2rem)] max-w-md overflow-y-auto animate-float-up focus:outline-none sm:inset-x-auto sm:left-1/2 sm:bottom-auto sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2"
      >
        <div className="card-cute relative overflow-hidden">
          {/* Holographic stripe at top */}
          <div className="h-1.5 w-full bg-holo-vivid" />

          {/* Close button */}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-[var(--muted)] text-[var(--foreground)]/60 hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] transition"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="px-6 pb-6 pt-6 sm:px-8">
            {stage && (
              <>
                {/* The storefront's header pattern — a pixel eyebrow over a
                    display heading — as used on /welcome-gift and /cart.
                    The eyebrow doubles as spacing: it occupies the close
                    button's row, so the heading below starts clear of it
                    without padding the whole card out to compensate. */}
                <div className="mb-4 text-center">
                  <p className="font-pixel text-[10px] uppercase tracking-tight text-[var(--primary)]">
                    {STAGE_COPY[stage].eyebrow}
                  </p>
                  <h2
                    id="popup-title"
                    // The eyebrow above already occupies the close button's row,
                    // so the heading only has to manage its own line breaks.
                    className={`mx-auto mt-2 text-balance font-display font-black leading-tight text-[var(--foreground)] ${
                      STAGE_COPY[stage].narrow
                        ? "max-w-[15rem] text-[1.35rem] sm:text-2xl"
                        : "text-[1.28rem] sm:text-2xl"
                    }`}
                  >
                    {STAGE_COPY[stage].title}
                  </h2>
                </div>

                <ScratchCard
                  revealed={state !== "scratch"}
                  onFirstScratch={() => void requestDraw()}
                  onReveal={handleReveal}
                  revealLabel="Skip the scratch"
                >
                  {/* What the foil hides is the *fact* of a prize, never its
                      size: the amount is not sent to the browser until an email
                      is submitted, so there is nothing to read ahead and no
                      invitation to weigh the number against the public
                      BESTIE10 at the exact moment we are asking for something.

                      The "Claim it now" button lives inside the heart, but it
                      is deferred until the scratch is complete. That keeps the
                      affordance visually tied to the reveal while preventing
                      any mid-scratch peeking through the foil's gaps. The empty
                      area inside the heart during scratch is a deliberate
                      pause, not a missing affordance. */}
                  {state === "claim" ? (
                    <form
                      onSubmit={handleSubmit}
                      className="w-full space-y-2.5"
                      noValidate
                    >
                      {/* Visually redundant next to the placeholder and the
                          button, but screen readers still need it. */}
                      <label htmlFor="popup-email" className="sr-only">
                        Your email address
                      </label>
                      <input
                        ref={emailRef}
                        id="popup-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
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
                        className="btn-candy w-full py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {loading ? "Revealing…" : "Reveal my discount ✨"}
                      </button>
                    </form>
                  ) : (
                    <div className="w-full text-center">
                      <Gift className="mx-auto h-7 w-7 text-[var(--primary)]" />
                      <p className="mt-1.5 font-display text-lg font-black text-[var(--primary)]">
                        Your exclusive offer…
                      </p>
                      {state === "prize" && (
                        <button
                          type="button"
                          onClick={handleClaim}
                          className="btn-candy mt-3 inline-flex w-fit max-w-[82%] animate-float-up whitespace-nowrap px-5 py-2.5 text-sm"
                        >
                          Claim it now
                        </button>
                      )}
                    </div>
                  )}
                </ScratchCard>

                {state === "claim" && (
                  <>
                    {/* One scannable line. The bundle leads and is tinted
                        because it is the largest offer here, then what the
                        address itself buys. BUNDLE is read from the promotions
                        engine so the copy cannot drift from what checkout
                        actually applies. */}
                    <p className="mt-3 text-center text-[11px] font-semibold leading-relaxed text-[var(--foreground)]/55">
                      <span className="text-[var(--primary)]">
                        {BUNDLE.label} on any {BUNDLE.groupSize}
                      </span>{" "}
                      · Member promos · Early access
                    </p>

                    <p className="mt-1.5 text-center text-xs text-[var(--foreground)]/40">
                      No spam. Unsubscribe anytime.
                    </p>
                  </>
                )}
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
                  {/* The payoff. This screen — not the scratch — is where the
                      number finally lands, so it carries the celebration. */}
                  {alreadyMember
                    ? "Welcome back, bestie! 💕"
                    : `${revealedPercent}% off is yours! 🎉`}
                </h2>
                <p className="mb-5 text-sm leading-relaxed text-[var(--foreground)]/65">
                  {alreadyMember
                    ? "You're already on the VIP list, so here's the code we sent you. 💌"
                    : emailed
                      ? "Here's your code — we've emailed it to you as well. 💌"
                      : "Here's your code — copy it before you close this. 💾"}
                </p>

                <PromoCodeBlock code={code} note={codeNote} />

                <Link
                  href="/products"
                  className="btn-candy mt-5 inline-block px-8 py-3 text-sm"
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

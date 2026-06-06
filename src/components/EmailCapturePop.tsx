"use client";

/**
 * EmailCapturePop — welcome pop-up that fires after 3 s on the user's first
 * visit (or after 7 days since last shown). Collects an email address and
 * reveals the WELCOME10 promo code.
 *
 * Strategy:
 *  - Shown once per session + throttled to once every 7 days via localStorage.
 *  - Dismissed permanently if the user closes it twice (stored in localStorage).
 *  - Fully keyboard-accessible; traps focus when open.
 *  - No CLS — the modal is fixed-position, rendered client-side only.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X, Sparkles, Gift } from "lucide-react";

const LS_KEY_SHOWN_AT = "y2k_popup_shown_at";
const LS_KEY_DISMISS_COUNT = "y2k_popup_dismiss_count";
const LS_KEY_SUBSCRIBED = "y2k_popup_subscribed";
const THROTTLE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_DISMISSALS = 2; // hide forever after closing twice
const DELAY_MS = 3_000; // show after 3 s

type PopupState = "hidden" | "visible" | "success";

export function EmailCapturePop() {
  const [state, setState] = useState<PopupState>("hidden");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("WELCOME10");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Decide whether to show the pop-up.
  useEffect(() => {
    const alreadySubscribed = localStorage.getItem(LS_KEY_SUBSCRIBED) === "1";
    if (alreadySubscribed) return;

    const dismissCount = parseInt(localStorage.getItem(LS_KEY_DISMISS_COUNT) ?? "0", 10);
    if (dismissCount >= MAX_DISMISSALS) return;

    const lastShownAt = parseInt(localStorage.getItem(LS_KEY_SHOWN_AT) ?? "0", 10);
    const msSinceShown = Date.now() - lastShownAt;
    if (msSinceShown < THROTTLE_MS) return;

    const timer = window.setTimeout(() => {
      setState("visible");
      localStorage.setItem(LS_KEY_SHOWN_AT, String(Date.now()));
    }, DELAY_MS);

    return () => window.clearTimeout(timer);
  }, []);

  // Focus the email input when the pop-up opens.
  useEffect(() => {
    if (state === "visible") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [state]);

  // Trap focus inside the dialog while open.
  useEffect(() => {
    if (state === "hidden") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'a,button,input,textarea,select,[tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function dismiss() {
    const prev = parseInt(localStorage.getItem(LS_KEY_DISMISS_COUNT) ?? "0", 10);
    localStorage.setItem(LS_KEY_DISMISS_COUNT, String(prev + 1));
    setState("hidden");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim(), source: "popup" }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setCode(data.code ?? "WELCOME10");
      setState("success");
      localStorage.setItem(LS_KEY_SUBSCRIBED, "1");
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (state === "hidden") return null;

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
        className="fixed inset-x-4 bottom-8 z-50 mx-auto max-w-md animate-float-up sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2"
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

          <div className="px-8 pb-8 pt-6">
            {state === "visible" && (
              <>
                {/* Icon + heading */}
                <div className="mb-5 text-center">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary-soft)] mb-3">
                    <Gift className="h-7 w-7 text-[var(--primary)]" />
                  </div>
                  <h2
                    id="popup-title"
                    className="text-2xl font-extrabold text-[var(--foreground)] leading-tight"
                    style={{ fontFamily: "var(--font-baloo), sans-serif" }}
                  >
                    Welcome to the Club! ✨
                  </h2>
                  <p className="mt-2 text-sm text-[var(--foreground)]/65 leading-relaxed">
                    Join Y2KASE besties and get{" "}
                    <strong className="text-[var(--primary)]">10% off</strong> your
                    first order — plus early access to new drops. 🌸
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3" noValidate>
                  <div>
                    <label
                      htmlFor="popup-name"
                      className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50"
                    >
                      Your name (optional)
                    </label>
                    <input
                      id="popup-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Sakura"
                      autoComplete="given-name"
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 transition"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="popup-email"
                      className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50"
                    >
                      Your email <span className="text-[var(--primary)]">*</span>
                    </label>
                    <input
                      ref={inputRef}
                      id="popup-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      autoComplete="email"
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 transition"
                    />
                  </div>

                  {error && (
                    <p className="text-xs text-red-500 font-semibold">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !email}
                    className="btn-candy w-full py-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? "Sending…" : "Claim My 10% Off ✨"}
                  </button>

                  <p className="text-center text-xs text-[var(--foreground)]/40">
                    No spam. Unsubscribe anytime.
                  </p>
                </form>
              </>
            )}

            {state === "success" && (
              <div className="text-center py-2">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary-soft)] mb-4">
                  <Sparkles className="h-8 w-8 text-[var(--primary)]" />
                </div>
                <h2
                  className="text-2xl font-extrabold text-[var(--foreground)] mb-2"
                  style={{ fontFamily: "var(--font-baloo), sans-serif" }}
                >
                  You&apos;re in, bestie! 🎉
                </h2>
                <p className="text-sm text-[var(--foreground)]/65 mb-5">
                  Your discount code is ready. Paste it at checkout — and check
                  your inbox for a confirmation email! 💌
                </p>

                {/* Code reveal */}
                <div className="rounded-2xl border-2 border-dashed border-[var(--primary)] bg-[var(--primary-soft)] px-6 py-4 mb-5">
                  <p className="text-xs font-bold uppercase tracking-widest text-[var(--primary)]/70 mb-1">
                    Your code
                  </p>
                  <p
                    className="text-3xl font-black text-[var(--primary)] tracking-widest"
                    style={{ fontFamily: "var(--font-pixel), monospace" }}
                  >
                    {code}
                  </p>
                  <p className="text-xs text-[var(--foreground)]/50 mt-1">
                    10% off · Enter at checkout · One-time use
                  </p>
                </div>

                <Link
                  href="/products"
                  className="btn-candy inline-block px-8 py-3 text-sm"
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

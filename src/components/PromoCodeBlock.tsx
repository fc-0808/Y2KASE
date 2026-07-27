"use client";

/**
 * PromoCodeBlock — a discount code with one-tap copy.
 *
 * The code is handed over unconditionally: no email, no gate. That makes the
 * copy button the primary action of the block rather than a nicety, so a click
 * that quietly does nothing is not an acceptable outcome. `navigator.clipboard`
 * is unavailable over plain HTTP and can be switched off by permissions policy,
 * so a failed write falls back to selecting the code for the keyboard instead.
 *
 * Presentational only — the caller owns which code is shown, so nothing here
 * has to know that the storefront's welcome offer exists.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

/** How long the button holds its confirmation before returning to "Copy". */
const FEEDBACK_MS = 2000;

type CopyState = "idle" | "copied" | "manual";

export function PromoCodeBlock({
  code,
  note,
}: {
  /** The customer-facing code, e.g. "BESTIE10". */
  code: string;
  /** Fine print under the block, e.g. "10% off · Enter at checkout". */
  note: string;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const codeRef = useRef<HTMLSpanElement>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A pending reset must never outlive the component, and a second click has to
  // restart the countdown rather than race the first one back to "idle".
  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  function flash(next: Exclude<CopyState, "idle">) {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setState(next);
    resetTimer.current = setTimeout(() => setState("idle"), FEEDBACK_MS);
  }

  /** Leave the code highlighted so the user can finish the job with ⌘/Ctrl+C. */
  function selectCode() {
    const node = codeRef.current;
    const selection = window.getSelection();
    if (!node || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      flash("copied");
    } catch {
      selectCode();
      flash("manual");
    }
  }

  const copied = state === "copied";

  return (
    <div>
      <div className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--primary)]/55 bg-[var(--primary-soft)]/60 px-3.5 py-2.5 sm:px-4 sm:py-3">
        <div className="min-w-0 flex-1 text-left">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--primary)]/70">
            Your code
          </p>
          <span
            ref={codeRef}
            className="wordmark mt-0.5 block truncate text-lg tracking-[0.12em] sm:text-xl"
          >
            {code}
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          // Tracks the visible label so the accessible name always contains it
          // (WCAG 2.5.3), which is what voice-control users speak to click it.
          aria-label={copied ? "Copied!" : `Copy discount code ${code}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--primary)]/30 bg-white px-3.5 py-2 text-xs font-bold text-[var(--primary)] transition hover:bg-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" /> Copied!
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copy
            </>
          )}
        </button>
      </div>

      <p className="mt-2 text-center text-[11px] text-[var(--foreground)]/50">
        {state === "manual" ? "Press ⌘/Ctrl + C to copy" : note}
      </p>

      {/* The button's own label change is unreliable to announce; this is. */}
      <span role="status" aria-live="polite" className="sr-only">
        {state === "copied"
          ? `Discount code ${code} copied to clipboard.`
          : state === "manual"
            ? "Clipboard unavailable. The code is selected — copy it with your keyboard."
            : ""}
      </span>
    </div>
  );
}

"use client";

/**
 * Cookie consent banner — the visible half of our Consent Mode v2 setup.
 *
 * Shows on first visit (and whenever a "Cookie settings" link dispatches
 * CONSENT_OPEN_EVENT). The visitor's choice is persisted and pushed to gtag, so
 * GA4 only writes analytics cookies after an explicit opt-in. Rejecting keeps
 * everything denied while Consent Mode still models traffic.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";
import {
  CONSENT_GRANT_ALL,
  CONSENT_DENY_ALL,
  CONSENT_OPEN_EVENT,
  readConsent,
  saveConsent,
} from "@/lib/analytics/consent";

export function CookieConsent() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Show only when the visitor hasn't decided yet. Runs after mount to avoid
    // an SSR/client hydration mismatch (the cookie isn't available on the server).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!readConsent()) setOpen(true);

    const reopen = () => setOpen(true);
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
  }, []);

  if (!open) return null;

  function choose(granted: boolean) {
    saveConsent(granted ? CONSENT_GRANT_ALL : CONSENT_DENY_ALL);
    setOpen(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie consent"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-2xl rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_20px_60px_-25px_rgba(120,60,120,0.55)] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2"
    >
      <div className="h-1 w-12 rounded-full bg-holo-vivid" />
      <div className="mt-3 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--muted)] text-[var(--primary)]">
          <Cookie className="h-5 w-5" />
        </span>
        <div className="text-sm text-[var(--foreground)]/75">
          <p className="font-bold text-[var(--foreground)]">
            We use cookies, bestie 🍪
          </p>
          <p className="mt-1 leading-relaxed">
            We use essential cookies to run the store and, with your okay,
            analytics cookies to understand what you love and make Y2KASE better.
            See our{" "}
            <Link
              href="/policies/privacy-policy"
              className="font-semibold text-[var(--primary)] underline"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => choose(false)}
          className="rounded-full border border-[var(--border)] bg-[var(--card)] px-5 py-2.5 text-sm font-bold text-[var(--foreground)]/70 transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
        >
          Reject non-essential
        </button>
        <button
          type="button"
          onClick={() => choose(true)}
          className="btn-candy px-6 py-2.5 text-sm"
        >
          Accept all
        </button>
      </div>
    </div>
  );
}

"use client";

/**
 * The recovery screen every runtime error boundary renders.
 *
 * Shared because there are three boundaries at different depths — the storefront
 * group, the checkout group and the ungrouped root fallback — and they differ
 * only in the chrome their parent layout supplies. Keeping the panel itself in
 * one place stops the retry affordance and the support address from drifting
 * apart between them.
 */

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, Home } from "lucide-react";
import { SUPPORT_EMAIL } from "@/lib/support/constants";

export function ErrorPanel({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  /**
   * Next 16 passes both `retry` and the older `reset`. `retry` is the name the
   * current docs use, so boundaries standardise on it.
   */
  retry: () => void;
}) {
  useEffect(() => {
    // Surface to the server logs / monitoring.
    console.error("[app error]", error);
  }, [error]);

  return (
    <>
      <meta name="robots" content="noindex, nofollow, noarchive" />
      <div className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-24 text-center sm:px-6">
        <p className="text-5xl">🩹</p>
        <h1 className="mt-5 font-display text-2xl font-black sm:text-3xl">
          Something went sideways
        </h1>
        <p className="mt-3 text-[var(--foreground)]/70">
          We hit an unexpected snag. Try again — and if it keeps happening,
          email us at{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-semibold text-[var(--primary)]"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={retry}
            className="btn-candy inline-flex items-center gap-2 px-6 py-3 text-sm"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-5 py-3 text-sm font-bold transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            <Home className="h-4 w-4" /> Home
          </Link>
        </div>
        {error.digest && (
          <p className="mt-6 text-xs text-[var(--foreground)]/40">
            Reference: {error.digest}
          </p>
        )}
      </div>
    </>
  );
}

"use client";

/**
 * Global error boundary. Catches unexpected runtime errors in the route tree
 * and shows a branded recovery screen with a retry, instead of a raw stack /
 * blank page — the resilient experience a production store should always give.
 */

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, Home } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the server logs / monitoring.
    console.error("[app error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-24 text-center sm:px-6">
      <p className="text-5xl">🩹</p>
      <h1 className="mt-5 font-display text-2xl font-black sm:text-3xl">
        Something went sideways
      </h1>
      <p className="mt-3 text-[var(--foreground)]/70">
        We hit an unexpected snag. Try again — and if it keeps happening, email
        us at{" "}
        <a
          href="mailto:hello@y2kase.com"
          className="font-semibold text-[var(--primary)]"
        >
          hello@y2kase.com
        </a>
        .
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
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
  );
}

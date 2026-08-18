"use client";

import { useEffect } from "react";
import Link from "next/link";
import "./globals.css";

/**
 * Last-resort boundary for failures in the root layout itself.
 *
 * Unlike segment error.tsx, a global boundary replaces the root layout and
 * therefore must provide its own document shell and crawler directives.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <title>Something went wrong · Y2KASE</title>
        <meta name="robots" content="noindex, nofollow, noarchive" />
      </head>
      <body className="flex min-h-dvh flex-col">
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-4 py-24 text-center">
          <h1 className="font-display text-2xl font-black sm:text-3xl">
            Something went sideways
          </h1>
          <p className="mt-3 text-[var(--foreground)]/70">
            We hit an unexpected snag. Try again, or return to the storefront.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="btn-candy px-6 py-3 text-sm"
            >
              Try again
            </button>
            <Link
              href="/"
              className="rounded-full border border-[var(--border)] bg-[var(--card)] px-6 py-3 text-sm font-bold hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              Return home
            </Link>
          </div>
          {error.digest && (
            <p className="mt-6 text-xs text-[var(--foreground)]/40">
              Reference: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}

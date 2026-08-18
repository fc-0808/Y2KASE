/**
 * /preview/fresh-visit — the handoff between a reset and the visit it enables.
 *
 * Reached only via `/api/preview/fresh-visit`, which has already expired the
 * server-owned cookies. This page re-verifies the same signed ticket (so the
 * landing path is never carried by an unsigned query parameter), clears browser
 * storage, and forwards. On a healthy connection it is on screen for a few
 * frames; the card below is what a slow device or a failed ticket sees.
 *
 * Living under `/preview` keeps it out of first-party analytics (see
 * `isTrackablePath`) and out of robots; the metadata below keeps it out of
 * search results. It sits outside the `(storefront)` route group on purpose —
 * the header, footer and pop-up islands have no business booting on a page
 * whose entire job is to leave.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Sparkles } from "lucide-react";
import { FreshVisitBootstrap } from "./FreshVisitBootstrap";
import {
  asFreshVisitFailure,
  verifyFreshVisitToken,
  type FreshVisitFailure,
} from "@/lib/preview/fresh-visit";
import {
  FRESH_VISIT_STATUS_PARAM,
  FRESH_VISIT_TOKEN_PARAM,
} from "@/lib/preview/routes";

export const metadata: Metadata = {
  title: "Preparing a fresh visit",
  robots: { index: false, follow: false },
};

const FAILURE_COPY: Record<FreshVisitFailure, { title: string; body: string }> =
  {
    missing: {
      title: "This link is incomplete",
      body: "A fresh-visit link carries a signed ticket. Generate a new one from the admin console and open that instead.",
    },
    invalid: {
      title: "This link isn't valid",
      body: "The ticket didn't verify — it was edited in transit, or it was signed for a different environment. Generate a new one from the admin console.",
    },
    expired: {
      title: "This link has expired",
      body: "Fresh-visit links last 30 minutes so an old one can't resurface later. Generate a new one from the admin console.",
    },
  };

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  const value = params[key];
  if (typeof value === "string") return value;
  return Array.isArray(value) ? (value[0] ?? null) : null;
}

export default async function FreshVisitPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = readParam(params, FRESH_VISIT_TOKEN_PARAM);

  // With no ticket at all, fall back to the reason the entry route reported.
  // Anything else — including someone navigating here directly — is "missing".
  const verification = token
    ? verifyFreshVisitToken(token)
    : ({
        ok: false,
        reason:
          asFreshVisitFailure(readParam(params, FRESH_VISIT_STATUS_PARAM)) ??
          "missing",
      } as const);

  if (!verification.ok) {
    const copy = FAILURE_COPY[verification.reason];
    return (
      <Shell
        icon={
          <AlertTriangle className="h-6 w-6 text-amber-600" aria-hidden="true" />
        }
        title={copy.title}
        body={copy.body}
      >
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            href="/admin/fresh-visit"
            className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-95"
          >
            Open the admin console
          </Link>
          <Link
            href="/"
            className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-bold text-[var(--foreground)]/70 transition hover:bg-[var(--muted)]"
          >
            Go to the storefront
          </Link>
        </div>
      </Shell>
    );
  }

  const { path } = verification.ticket;
  return (
    <Shell
      icon={
        <Sparkles
          className="h-6 w-6 animate-pulse text-[var(--primary)]"
          aria-hidden="true"
        />
      }
      title="Preparing a fresh visit…"
      body="Clearing this browser's storefront memory, then opening the site as a first-time visitor."
    >
      <FreshVisitBootstrap destination={path} />
      {/* Server cookies are already cleared, so the manual route is a genuine
          fallback rather than a broken half-reset. */}
      <noscript>
        <p className="mt-6 text-sm text-[var(--foreground)]/60">
          JavaScript is disabled, so browser storage could not be cleared.{" "}
          <Link href={path} className="font-bold underline">
            Continue to the storefront
          </Link>
          .
        </p>
      </noscript>
    </Shell>
  );
}

function Shell({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center bg-[var(--background)] px-4 py-16">
      <div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--card)] p-8 text-center shadow-sm">
        <div
          className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--muted)]"
          aria-hidden="true"
        >
          {icon}
        </div>
        <h1 className="text-balance font-display text-xl font-black text-[var(--foreground)]">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--foreground)]/60">
          {body}
        </p>
        {children}
      </div>
    </main>
  );
}

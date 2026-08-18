"use client";

/**
 * The generator half of the Fresh visit page.
 *
 * Everything the operator can change — where the visit lands, whether it counts
 * as traffic — is signed into the ticket, so the link is regenerated whenever a
 * choice changes rather than patched client-side. That keeps exactly one rule
 * in the product: the link you are looking at is the link you will get.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { createFreshVisitLink, type FreshVisitLink } from "./actions";
import { normalizeLandingPath } from "@/lib/preview/visitor-state";
import { cn } from "@/lib/utils";

const PRESETS = [
  { path: "/", label: "Home" },
  { path: "/products", label: "Shop all" },
  { path: "/welcome-gift", label: "Welcome gift" },
] as const;

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function FreshVisitConsole({
  initialLink,
  origin,
}: {
  initialLink: FreshVisitLink;
  origin: string;
}) {
  const [link, setLink] = useState(initialLink);
  const [customPath, setCustomPath] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  /**
   * Clock for the expiry countdown. Starts at zero so the server and the first
   * client render agree, and is only ever advanced from a timer callback — a
   * hydration mismatch on a QA tool is a small bug that costs a large amount of
   * trust in everything else the tool says.
   */
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const immediate = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 1_000);
    return () => {
      window.clearTimeout(immediate);
      window.clearInterval(interval);
    };
  }, []);

  /** Regenerations are cheap and can overlap; only the newest one may win. */
  const requestRef = useRef(0);
  useEffect(
    () => () => {
      requestRef.current = -1;
    },
    [],
  );

  function generate(path: string, excludeFromAnalytics: boolean) {
    setError("");
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    startTransition(async () => {
      const result = await createFreshVisitLink({
        path,
        excludeFromAnalytics,
      });
      if (requestRef.current !== requestId) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setLink(result.link);
      setCopied(false);
    });
  }

  function submitCustomPath() {
    const candidate = normalizeLandingPath(customPath);
    if (!candidate) {
      setError(
        "Enter a storefront path that starts with “/” — /admin and /api pages can't be previewed as a shopper.",
      );
      return;
    }
    setCustomPath("");
    generate(candidate, link.excludeFromAnalytics);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError("Your browser blocked clipboard access — copy the link above.");
    }
  }

  const absoluteUrl = `${origin}${link.href}`;
  const remainingMs = now === 0 ? null : Math.max(0, link.expiresAt - now);
  const expired = remainingMs === 0;
  const presetMatch = PRESETS.some((preset) => preset.path === link.path);

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <header className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="font-bold">Generate a link</h2>
        <p className="mt-0.5 text-sm text-[var(--foreground)]/55">
          Each link works for 30 minutes and can be opened as many times as you
          need.
        </p>
      </header>

      <div className="space-y-5 p-5">
        {/* ── Landing page ─────────────────────────────────────────────── */}
        <fieldset>
          <legend className="text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50">
            Land on
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS.map((preset) => {
              const active = link.path === preset.path;
              return (
                <button
                  key={preset.path}
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    generate(preset.path, link.excludeFromAnalytics)
                  }
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm font-bold transition disabled:opacity-50",
                    active
                      ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                      : "border-[var(--border)] text-[var(--foreground)]/60 hover:bg-[var(--muted)]",
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
            {!presetMatch && (
              <span className="rounded-full border border-[var(--primary)] bg-[var(--primary)]/10 px-3.5 py-1.5 font-mono text-sm font-bold text-[var(--primary)]">
                {link.path}
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={customPath}
              onChange={(event) => setCustomPath(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                submitCustomPath();
              }}
              placeholder="/products/some-product-slug"
              aria-label="Custom landing path"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
            />
            <button
              type="button"
              disabled={pending || customPath.trim().length === 0}
              onClick={submitCustomPath}
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--foreground)]/70 transition hover:bg-[var(--muted)] disabled:opacity-40"
            >
              Use this path
            </button>
          </div>
        </fieldset>

        {/* ── Analytics ────────────────────────────────────────────────── */}
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] p-3.5">
          <input
            type="checkbox"
            checked={link.excludeFromAnalytics}
            disabled={pending}
            onChange={(event) => generate(link.path, event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
          />
          <span className="min-w-0">
            <span className="block text-sm font-bold">
              Keep this visit out of Visitors analytics
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-[var(--foreground)]/55">
              Suppresses the page-view beacon for two hours so a QA run doesn&apos;t
              register as a real unique visitor. Third-party pixels (GA4, Meta,
              TikTok, Pinterest) still fire exactly as they would for a shopper —
              turn this off when you need to verify the tracking pipeline
              end&#8209;to&#8209;end.
            </span>
          </span>
        </label>

        {/* ── The link ─────────────────────────────────────────────────── */}
        <div className="rounded-xl bg-[var(--muted)]/50 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/50">
              Your link
            </p>
            <p
              className={cn(
                "text-xs font-semibold tabular-nums",
                expired ? "text-amber-600" : "text-[var(--foreground)]/45",
              )}
            >
              {remainingMs === null
                ? "Ready"
                : expired
                  ? "Expired — regenerate to use it"
                  : `Expires in ${formatCountdown(remainingMs)}`}
            </p>
          </div>
          <p className="mt-2 break-all font-mono text-xs text-[var(--foreground)]/70">
            {absoluteUrl}
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 text-sm font-semibold text-rose-600"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <a
            href={expired ? undefined : link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={expired || undefined}
            onClick={(event) => {
              if (expired) event.preventDefault();
            }}
            className={cn(
              "inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-95",
              expired && "pointer-events-none opacity-40",
            )}
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Open clean visit
          </a>

          <button
            type="button"
            onClick={copyLink}
            disabled={expired}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-bold text-[var(--foreground)]/70 transition hover:bg-[var(--muted)] disabled:opacity-40"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy link"}
          </button>

          <button
            type="button"
            onClick={() => generate(link.path, link.excludeFromAnalytics)}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-bold text-[var(--foreground)]/70 transition hover:bg-[var(--muted)] disabled:opacity-40"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            Regenerate
          </button>
        </div>

        <p className="text-xs leading-relaxed text-[var(--foreground)]/50">
          Paste the link into a private window to also test as a signed-out
          shopper — it needs no admin session to work.
        </p>
      </div>
    </section>
  );
}

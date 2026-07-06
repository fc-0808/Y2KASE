"use client";

/**
 * Auto-Pin control panel for the Social Studio.
 *
 * Surfaces the autonomous Pinterest drip at a glance: how much of the catalog
 * has been posted (by listing), today's activity, and the on/off state. The
 * "Post next listing now" button fires the exact routine the daily cron runs —
 * posting a whole listing's photos + video — for instant feedback and to seed
 * the pipeline before the first scheduled run.
 */

import { useState, useTransition } from "react";
import {
  Sparkles,
  Zap,
  Images,
  Film,
  LayoutGrid,
  CalendarCheck,
  ArrowRight,
  ImageOff,
  CheckCircle2,
  Hash,
  AlertTriangle,
} from "lucide-react";
import type {
  AutoPinCoverage,
  NextListingPreview,
} from "@/lib/social/auto-pin";
import { runAutoPinNow } from "./actions";

/** Human-friendly "next run" label from an ISO timestamp (daily cron). */
function formatNextRun(iso: string): string {
  const then = new Date(iso);
  const hours = Math.max(0, Math.round((then.getTime() - Date.now()) / 3_600_000));
  const time = then.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (hours <= 0) return `today · ${time}`;
  if (hours < 24) return `${time} · in ${hours}h`;
  return `${then.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`;
}

export function AutoPinPanel({
  coverage,
  nextListing,
  pinterestReady,
}: {
  coverage: AutoPinCoverage;
  nextListing: NextListingPreview | null;
  pinterestReady: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const {
    totalProducts,
    pinnedProducts,
    remainingProducts,
    totalMedia,
    pinnedMedia,
    mediaPinnedToday,
    stuckCount,
    enabled,
    perDay,
  } = coverage;

  const pct =
    totalProducts > 0 ? Math.round((pinnedProducts / totalProducts) * 100) : 0;

  function handleRun() {
    setMsg(null);
    startTransition(async () => {
      const res = await runAutoPinNow();
      setMsg({ ok: res.ok, text: res.message });
    });
  }

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E60023]/10 text-[#E60023]">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h3 className="flex items-center gap-2 text-sm font-black">
              Pinterest auto-pin
              <span
                className={
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold " +
                  (enabled
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-[var(--muted)] text-[var(--foreground)]/50")
                }
              >
                <span
                  className={
                    "h-1.5 w-1.5 rounded-full " +
                    (enabled ? "bg-emerald-500" : "bg-[var(--foreground)]/30")
                  }
                />
                {enabled ? "LIVE" : "OFF"}
              </span>
            </h3>
            <p className="mt-0.5 text-xs text-[var(--foreground)]/55">
              {enabled
                ? `Posts ${perDay} full listing${perDay === 1 ? "" : "s"} per day — every photo + the video.`
                : 'Set PINTEREST_AUTOPIN_ENABLED="true" to run the daily drip automatically.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRun}
          disabled={pending || !pinterestReady || remainingProducts === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#E60023] px-4 text-xs font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          title={
            !pinterestReady
              ? "Connect Pinterest first"
              : remainingProducts === 0
                ? "Every listing is already posted"
                : "Post the next listing now"
          }
        >
          <Zap className={"h-3.5 w-3.5" + (pending ? " animate-pulse" : "")} />
          {pending ? "Posting…" : "Post next listing now"}
        </button>
      </div>

      {/* Up next — the exact listing the next run will post */}
      {nextListing ? (
        <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--muted)]/30 px-5 py-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--muted)]">
            {nextListing.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={nextListing.coverUrl}
                alt={nextListing.productTitle}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[var(--foreground)]/30">
                <ImageOff className="h-4 w-4" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#E60023]">
              <ArrowRight className="h-3 w-3" /> Up next
            </div>
            <p className="truncate text-sm font-semibold text-[var(--foreground)]/85">
              {nextListing.productSlug ? (
                <a
                  href={`/products/${nextListing.productSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#E60023] hover:underline"
                >
                  {nextListing.productTitle}
                </a>
              ) : (
                nextListing.productTitle
              )}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-[var(--foreground)]/55">
              <span>
                {nextListing.photoCount} photo
                {nextListing.photoCount === 1 ? "" : "s"}
                {nextListing.hasVideo ? " + 1 video" : ""} ·{" "}
                <span className="font-semibold text-[var(--foreground)]/70">
                  {nextListing.totalPins} pin
                  {nextListing.totalPins === 1 ? "" : "s"}
                </span>
              </span>
              {nextListing.boardName && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#E60023]/10 px-2 py-0.5 font-semibold text-[#E60023]">
                  <Hash className="h-2.5 w-2.5" />
                  {nextListing.boardName}
                </span>
              )}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/45">
              {enabled ? "Next run" : "Automation off"}
            </div>
            <div className="text-xs font-semibold text-[var(--foreground)]/80">
              {enabled ? formatNextRun(nextListing.nextRunAtIso) : "Manual only"}
            </div>
          </div>
        </div>
      ) : (
        totalProducts > 0 && (
          <div className="flex items-center gap-2 border-b border-[var(--border)] bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            All {totalProducts.toLocaleString()} listings posted — nothing queued.
          </div>
        )
      )}

      <div className="px-5 py-4">
        {/* Listing coverage progress */}
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
            <span className="text-[var(--foreground)]/60">Catalog coverage</span>
            <span className="text-[var(--foreground)]/80">
              {pinnedProducts.toLocaleString()} / {totalProducts.toLocaleString()}{" "}
              listings · <span className="text-[#E60023]">{pct}%</span>
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#E60023] to-[#ff5478] transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            icon={<CalendarCheck className="h-4 w-4" />}
            label="Pinned today"
            value={mediaPinnedToday}
            accent
          />
          <Stat
            icon={<LayoutGrid className="h-4 w-4" />}
            label="Listings left"
            value={remainingProducts}
          />
          <Stat
            icon={<Images className="h-4 w-4" />}
            label="Media pinned"
            value={pinnedMedia}
            sub={`of ${totalMedia.toLocaleString()}`}
          />
          <Stat
            icon={<Film className="h-4 w-4" />}
            label="Listings done"
            value={pinnedProducts}
            sub={`of ${totalProducts.toLocaleString()}`}
          />
        </div>

        {stuckCount > 0 && (
          <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {stuckCount.toLocaleString()} asset{stuckCount === 1 ? "" : "s"} gave
            up after {" "}retries — check the “rejected” tab. They no longer block
            the queue.
          </p>
        )}

        {msg && (
          <p
            className={
              "mt-3 text-xs font-semibold " +
              (msg.ok ? "text-emerald-600" : "text-red-500")
            }
          >
            {msg.text}
          </p>
        )}
      </div>
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border px-3 py-2.5 " +
        (accent
          ? "border-[#E60023]/20 bg-[#E60023]/5"
          : "border-[var(--border)] bg-[var(--muted)]/40")
      }
    >
      <div className="flex items-center gap-1.5 text-[var(--foreground)]/50">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-xl font-black tabular-nums">
          {value.toLocaleString()}
        </span>
        {sub && (
          <span className="text-[11px] font-medium text-[var(--foreground)]/40">
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

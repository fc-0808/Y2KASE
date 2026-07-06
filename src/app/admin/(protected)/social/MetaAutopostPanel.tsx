"use client";

/**
 * Instagram + Facebook auto-posting control panel for the Social Studio.
 *
 * Mirrors the Pinterest panel: connection status, catalog coverage, what's
 * posting next, and a manual "Post next now" trigger. Handles the setup states
 * (app not configured → env guidance; configured but not connected → OAuth
 * connect) so the operator always knows the next step.
 */

import { useState, useTransition } from "react";
import {
  Camera,
  ThumbsUp,
  Zap,
  ArrowRight,
  ImageOff,
  CheckCircle2,
  Link2,
  LayoutGrid,
  CalendarCheck,
} from "lucide-react";
import type { MetaCoverage, MetaNextPreview } from "@/lib/social/meta-autopost";
import {
  getMetaConnectUrl,
  checkMetaConnection,
  runMetaAutopostNow,
} from "./actions";

function formatNextRun(iso: string): string {
  const then = new Date(iso);
  const hours = Math.max(0, Math.round((then.getTime() - Date.now()) / 3_600_000));
  const time = then.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (hours <= 0) return `today · ${time}`;
  if (hours < 24) return `${time} · in ${hours}h`;
  return `${then.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`;
}

export function MetaAutopostPanel({
  coverage,
  nextPreview,
  metaConfigured,
}: {
  coverage: MetaCoverage;
  nextPreview: MetaNextPreview | null;
  metaConfigured: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const {
    connected,
    totalProducts,
    postedProducts,
    remainingProducts,
    igPosts,
    fbPosts,
    postedToday,
    enabled,
    perRun,
  } = coverage;

  const isConnected = connected.length > 0;
  const pct =
    totalProducts > 0 ? Math.round((postedProducts / totalProducts) * 100) : 0;

  function handleConnect() {
    setMsg(null);
    startTransition(async () => {
      const res = await getMetaConnectUrl();
      if (res.ok && res.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
        setMsg({ ok: true, text: "Opened Meta authorization in a new tab." });
      } else {
        setMsg({ ok: false, text: res.message });
      }
    });
  }

  function handleVerify() {
    setMsg(null);
    startTransition(async () => {
      const res = await checkMetaConnection();
      setMsg({
        ok: res.connected,
        text: res.connected
          ? `Connected: ${[res.igUsername && `IG @${res.igUsername}`, res.pageName && `FB ${res.pageName}`].filter(Boolean).join(" · ")}`
          : res.message,
      });
    });
  }

  function handleRun() {
    setMsg(null);
    startTransition(async () => {
      const res = await runMetaAutopostNow();
      setMsg({ ok: res.ok, text: res.message });
    });
  }

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#F77737] text-white">
            <Camera className="h-5 w-5" />
          </span>
          <div>
            <h3 className="flex items-center gap-2 text-sm font-black">
              Instagram + Facebook auto-post
              <span
                className={
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold " +
                  (enabled && isConnected
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-[var(--muted)] text-[var(--foreground)]/50")
                }
              >
                <span
                  className={
                    "h-1.5 w-1.5 rounded-full " +
                    (enabled && isConnected ? "bg-emerald-500" : "bg-[var(--foreground)]/30")
                  }
                />
                {enabled && isConnected ? "LIVE" : isConnected ? "READY" : "OFF"}
              </span>
            </h3>
            <p className="mt-0.5 text-xs text-[var(--foreground)]/55">
              One listing/day → an IG carousel + Reel and an FB photo post + video.
            </p>
            {isConnected && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {connected.includes("instagram") && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#E1306C]/10 px-2 py-0.5 text-[10px] font-bold text-[#E1306C]">
                    <Camera className="h-2.5 w-2.5" /> Instagram
                  </span>
                )}
                {connected.includes("facebook") && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#1877F2]/10 px-2 py-0.5 text-[10px] font-bold text-[#1877F2]">
                    <ThumbsUp className="h-2.5 w-2.5" /> Facebook
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {metaConfigured && (
            <button
              type="button"
              onClick={isConnected ? handleVerify : handleConnect}
              disabled={pending}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-xs font-bold text-[var(--foreground)]/70 transition hover:border-[#E1306C] hover:text-[#E1306C] disabled:opacity-50"
            >
              <Link2 className="h-3.5 w-3.5" />
              {isConnected ? "Verify" : "Connect"}
            </button>
          )}
          <button
            type="button"
            onClick={handleRun}
            disabled={pending || !isConnected || remainingProducts === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#E1306C] to-[#F77737] px-4 text-xs font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            title={
              !isConnected
                ? "Connect Instagram / Facebook first"
                : remainingProducts === 0
                  ? "Every listing is already posted"
                  : "Post the next listing now"
            }
          >
            <Zap className={"h-3.5 w-3.5" + (pending ? " animate-pulse" : "")} />
            {pending ? "Posting…" : "Post next now"}
          </button>
        </div>
      </div>

      {/* Setup / not-configured guidance */}
      {!metaConfigured ? (
        <div className="border-b border-[var(--border)] bg-amber-50 px-5 py-3 text-xs text-amber-800">
          <span className="font-bold">Not set up yet.</span> Add{" "}
          <code className="rounded bg-amber-100 px-1">META_APP_ID</code> +{" "}
          <code className="rounded bg-amber-100 px-1">META_APP_SECRET</code>, then
          complete Meta App Review + Business Verification for{" "}
          <code className="rounded bg-amber-100 px-1">instagram_content_publish</code>{" "}
          and <code className="rounded bg-amber-100 px-1">pages_manage_posts</code>.
          Your IG must be a Business/Creator account linked to the Facebook Page.
        </div>
      ) : !isConnected ? (
        <div className="border-b border-[var(--border)] bg-[var(--muted)]/30 px-5 py-3 text-xs text-[var(--foreground)]/60">
          App configured. Click <span className="font-bold">Connect</span> to
          authorize your Facebook Page + Instagram account.
        </div>
      ) : nextPreview ? (
        <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--muted)]/30 px-5 py-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--muted)]">
            {nextPreview.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={nextPreview.coverUrl}
                alt={nextPreview.productTitle}
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
            <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#E1306C]">
              <ArrowRight className="h-3 w-3" /> Up next
            </div>
            <p className="truncate text-sm font-semibold text-[var(--foreground)]/85">
              {nextPreview.productSlug ? (
                <a
                  href={`/products/${nextPreview.productSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#E1306C] hover:underline"
                >
                  {nextPreview.productTitle}
                </a>
              ) : (
                nextPreview.productTitle
              )}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--foreground)]/55">
              {nextPreview.photoCount} photo{nextPreview.photoCount === 1 ? "" : "s"}
              {nextPreview.hasVideo ? " + video" : ""} → {nextPreview.platforms.join(" + ")}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/45">
              {enabled ? "Next run" : "Automation off"}
            </div>
            <div className="text-xs font-semibold text-[var(--foreground)]/80">
              {enabled ? formatNextRun(nextPreview.nextRunAtIso) : "Manual only"}
            </div>
          </div>
        </div>
      ) : totalProducts > 0 ? (
        <div className="flex items-center gap-2 border-b border-[var(--border)] bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          All {totalProducts.toLocaleString()} listings posted to Meta — nothing queued.
        </div>
      ) : null}

      {/* Coverage + stats (only meaningful once connected) */}
      {isConnected && (
        <div className="px-5 py-4">
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
              <span className="text-[var(--foreground)]/60">Catalog coverage</span>
              <span className="text-[var(--foreground)]/80">
                {postedProducts.toLocaleString()} / {totalProducts.toLocaleString()}{" "}
                listings · <span className="text-[#E1306C]">{pct}%</span>
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737] transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={<CalendarCheck className="h-4 w-4" />} label="Posted today" value={postedToday} accent />
            <Stat icon={<LayoutGrid className="h-4 w-4" />} label="Listings left" value={remainingProducts} />
            <Stat icon={<Camera className="h-4 w-4" />} label="IG posts" value={igPosts} />
            <Stat icon={<ThumbsUp className="h-4 w-4" />} label="FB posts" value={fbPosts} />
          </div>
        </div>
      )}

      {msg && (
        <p
          className={
            "px-5 pb-4 text-xs font-semibold " +
            (msg.ok ? "text-emerald-600" : "text-red-500")
          }
        >
          {msg.text}
        </p>
      )}
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border px-3 py-2.5 " +
        (accent
          ? "border-[#E1306C]/20 bg-[#E1306C]/5"
          : "border-[var(--border)] bg-[var(--muted)]/40")
      }
    >
      <div className="flex items-center gap-1.5 text-[var(--foreground)]/50">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-1 text-xl font-black tabular-nums">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

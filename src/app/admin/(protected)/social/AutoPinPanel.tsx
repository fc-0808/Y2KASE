"use client";

/**
 * Auto-Pin status panel for the Social Studio.
 *
 * Surfaces the autonomous Pinterest drip at a glance: how much of the catalog
 * has been pinned, how many images remain, today's count, and the on/off state.
 * The "Pin next now" button fires the exact same routine the daily cron runs,
 * for instant feedback and to seed the pipeline before the first scheduled run.
 */

import { useState, useTransition } from "react";
import { Sparkles, Zap } from "lucide-react";
import type { AutoPinCoverage } from "@/lib/social/auto-pin";
import { runAutoPinNow } from "./actions";

export function AutoPinPanel({
  coverage,
  pinterestReady,
}: {
  coverage: AutoPinCoverage;
  pinterestReady: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const { totalImages, pinnedImages, remaining, pinnedToday, enabled, perRun } =
    coverage;
  const pct =
    totalImages > 0 ? Math.round((pinnedImages / totalImages) * 100) : 0;

  function handleRun() {
    setMsg(null);
    startTransition(async () => {
      const res = await runAutoPinNow();
      setMsg({ ok: res.ok, text: res.message });
    });
  }

  return (
    <section className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-black">
            <Sparkles className="h-4 w-4 text-[#E60023]" /> Pinterest auto-pin
            <span
              className={
                "ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold " +
                (enabled
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-[var(--muted)] text-[var(--foreground)]/50")
              }
            >
              {enabled ? "ON" : "OFF"}
            </span>
          </h3>
          <p className="mt-0.5 text-[11px] text-[var(--foreground)]/50">
            {enabled
              ? `Pins ${perRun} new product photo${perRun === 1 ? "" : "s"} per day automatically.`
              : "Set PINTEREST_AUTOPIN_ENABLED=\"true\" to run the daily drip automatically."}
          </p>
        </div>

        <button
          type="button"
          onClick={handleRun}
          disabled={pending || !pinterestReady || remaining === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#E60023] px-4 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          title={
            !pinterestReady
              ? "Connect Pinterest first"
              : remaining === 0
                ? "Every image is already pinned"
                : "Pin the next product photo now"
          }
        >
          <Zap className={"h-3.5 w-3.5" + (pending ? " animate-pulse" : "")} />
          {pending ? "Pinning…" : "Pin next now"}
        </button>
      </div>

      {/* Catalog coverage progress */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--foreground)]/60">
          <span>Catalog coverage</span>
          <span>
            {pinnedImages.toLocaleString()} / {totalImages.toLocaleString()}{" "}
            images pinned ({pct}%)
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]">
          <div
            className="h-full rounded-full bg-[#E60023] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Pinned today" value={pinnedToday} />
        <Stat label="Remaining" value={remaining} />
        <Stat label="Total images" value={totalImages} />
      </div>

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
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-[var(--muted)]/50 px-3 py-2 text-center">
      <div className="text-lg font-black">{value.toLocaleString()}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--foreground)]/50">
        {label}
      </div>
    </div>
  );
}

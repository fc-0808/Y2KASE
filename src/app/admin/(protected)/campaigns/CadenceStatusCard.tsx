"use client";

import { AlertTriangle, CalendarDays, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CLUB_DEFAULT_BROADCASTS_PER_WEEK,
  CLUB_HARD_BROADCASTS_PER_WEEK,
  evaluateBroadcastCadence,
  type CadenceSnapshot,
} from "@/lib/marketing/cadence";
import type { CampaignType } from "@/lib/marketing/types";

export function CadenceStatusCard({
  cadence,
  campaignType,
  campaignId,
  onOpenCalendar,
}: {
  cadence: CadenceSnapshot;
  campaignType: CampaignType;
  campaignId: string;
  onOpenCalendar: () => void;
}) {
  const verdict = evaluateBroadcastCadence({
    now: new Date(),
    campaignType,
    broadcasts: cadence.broadcastsThisWeek,
    ignoreCampaignId: campaignId,
  });
  const blocked = !verdict.allowed;
  const next = cadence.nextSlot;

  return (
    <section
      className={cn(
        "mb-6 rounded-2xl border px-5 py-4",
        blocked
          ? "border-rose-200 bg-rose-50"
          : "border-border bg-card shadow-sm",
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
            <CalendarDays className="h-3.5 w-3.5" />
            Club cadence · {cadence.weekLabel}
          </div>
          <p className="mt-1 text-sm font-semibold text-foreground/80">
            {verdict.broadcastsUsed} of {CLUB_DEFAULT_BROADCASTS_PER_WEEK}{" "}
            default slots used this week
            {verdict.broadcastsUsed >= CLUB_DEFAULT_BROADCASTS_PER_WEEK
              ? ` · peak extra ${Math.min(verdict.broadcastsUsed, CLUB_HARD_BROADCASTS_PER_WEEK)}/${CLUB_HARD_BROADCASTS_PER_WEEK}`
              : ""}
            {next
              ? ` · next ${next.label} ${next.recommendedLocal}`
              : ""}
          </p>
          {blocked ? (
            <p className="mt-2 flex items-start gap-2 text-sm text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {verdict.blockers[0]?.message}
            </p>
          ) : verdict.warnings[0] ? (
            <p className="mt-2 flex items-start gap-2 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {verdict.warnings[0].message}
            </p>
          ) : (
            <p className="mt-2 flex items-start gap-2 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              This send is inside the Club frequency policy.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-foreground/55">
          <span>
            {cadence.holdouts.campaignEligible}/{cadence.holdouts.active}{" "}
            campaign-eligible
          </span>
          <button
            type="button"
            onClick={onOpenCalendar}
            className="rounded-full border border-border px-3 py-1.5 font-bold text-foreground hover:border-primary hover:text-primary"
          >
            This week&apos;s slots
          </button>
        </div>
      </div>
    </section>
  );
}

"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import type { UploadBatch, UploadSort, UploadWindow } from "@/lib/admin/upload-date";

const VISIBLE_DAYS = 12;

const PRESETS: { id: "all" | "today" | "7d" | "30d"; label: string }[] = [
  { id: "all", label: "All dates" },
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
];

export function UploadDateBar({
  batches,
  total,
  todayCount,
  weekCount,
  monthCount,
  window,
  sort,
  summary,
  onWindow,
  onSort,
}: {
  batches: UploadBatch[];
  total: number;
  todayCount: number;
  weekCount: number;
  monthCount: number;
  window: UploadWindow;
  sort: UploadSort;
  summary: string | null;
  onWindow: (window: UploadWindow) => void;
  onSort: (sort: UploadSort) => void;
}) {
  const activeDay = window.kind === "day" ? window.day : null;
  const { shown, overflow } = splitBatches(batches, activeDay);
  const presetCount = {
    all: total,
    today: todayCount,
    "7d": weekCount,
    "30d": monthCount,
  };

  return (
    <div className="grid gap-3 px-4 py-3.5 sm:px-5">
      <div className="grid gap-2.5 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:items-start">
        <span className="pt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/45">
          Uploaded
        </span>
        <div
          role="group"
          aria-label="Filter products by upload date"
          className="flex min-w-0 flex-wrap gap-2"
        >
          {PRESETS.map((preset) => (
            <DatePill
              key={preset.id}
              label={preset.label}
              count={presetCount[preset.id]}
              active={window.kind === preset.id}
              onClick={() =>
                onWindow(
                  window.kind === preset.id && preset.id !== "all"
                    ? { kind: "all" }
                    : { kind: preset.id },
                )
              }
            />
          ))}
        </div>
        <label className="flex items-center gap-2 sm:pt-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/45">
            Sort
          </span>
          <select
            aria-label="Sort products"
            value={sort}
            onChange={(event) => onSort(event.target.value as UploadSort)}
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          >
            <option value="review">Needs review</option>
            <option value="newest">Newest uploaded</option>
            <option value="oldest">Oldest uploaded</option>
          </select>
        </label>
      </div>

      {batches.length > 0 && (
        <div className="grid gap-2.5 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:items-start">
          <span className="pt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/45">
            By day
          </span>
          <div
            role="group"
            aria-label="Upload days"
            className="flex min-w-0 flex-wrap items-center gap-2"
          >
            {shown.map((batch) => (
              <DatePill
                key={batch.day}
                label={batch.label}
                count={batch.count}
                active={activeDay === batch.day}
                onClick={() =>
                  onWindow(
                    activeDay === batch.day
                      ? { kind: "all" }
                      : { kind: "day", day: batch.day },
                  )
                }
              />
            ))}
            {overflow.length > 0 && (
              <select
                aria-label="Older upload dates"
                value={overflow.some((batch) => batch.day === activeDay) ? activeDay ?? "" : ""}
                onChange={(event) => {
                  if (event.target.value) {
                    onWindow({ kind: "day", day: event.target.value });
                  }
                }}
                className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                <option value="">
                  {overflow.length} older {overflow.length === 1 ? "day" : "days"}
                </option>
                {overflow.map((batch) => (
                  <option key={batch.day} value={batch.day}>
                    {batch.label} ({batch.count})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      {summary && (
        <p className="text-xs font-medium text-foreground/55 sm:pl-[6.4rem]">
          {summary}
        </p>
      )}
    </div>
  );
}

export function UploadSortButton({
  sort,
  onSort,
}: {
  sort: UploadSort;
  onSort: (sort: UploadSort) => void;
}) {
  const active = sort === "newest" || sort === "oldest";
  return (
    <button
      type="button"
      onClick={() => onSort(sort === "newest" ? "oldest" : "newest")}
      aria-label={
        sort === "oldest"
          ? "Uploaded, oldest first. Show newest first."
          : "Uploaded, newest first. Show oldest first."
      }
      className={`inline-flex items-center gap-1 uppercase tracking-wide ${
        active ? "text-foreground" : "hover:text-foreground"
      }`}
    >
      Uploaded
      {sort === "oldest" ? (
        <ArrowUp className="h-3 w-3" aria-hidden />
      ) : (
        <ArrowDown className={`h-3 w-3 ${active ? "" : "opacity-40"}`} aria-hidden />
      )}
    </button>
  );
}

function splitBatches(
  batches: UploadBatch[],
  activeDay: string | null,
): { shown: UploadBatch[]; overflow: UploadBatch[] } {
  if (batches.length <= VISIBLE_DAYS) return { shown: batches, overflow: [] };
  const head = batches.slice(0, VISIBLE_DAYS);
  const rest = batches.slice(VISIBLE_DAYS);
  if (!activeDay || head.some((batch) => batch.day === activeDay)) {
    return { shown: head, overflow: rest };
  }
  const active = rest.find((batch) => batch.day === activeDay);
  if (!active) return { shown: head, overflow: rest };
  const displaced = head[VISIBLE_DAYS - 1];
  const overflow = rest.filter((batch) => batch.day !== activeDay);
  if (displaced) overflow.push(displaced);
  overflow.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  return {
    shown: [...head.slice(0, VISIBLE_DAYS - 1), active],
    overflow,
  };
}

function DatePill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        active
          ? "border-primary bg-primary-soft text-foreground shadow-sm"
          : "border-border bg-background/60 text-foreground/75 hover:border-primary/50 hover:bg-muted"
      }`}
    >
      <span className="whitespace-nowrap">{label}</span>
      <span
        className={`text-xs tabular-nums ${
          active ? "text-foreground/60" : "text-foreground/40"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

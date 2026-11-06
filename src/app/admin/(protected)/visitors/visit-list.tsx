"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type VisitCard = {
  id: number;
  path: string;
  time: string;
  crawler: boolean;
  reasons: string[];
  /** One line kept visible on a phone before the visit is opened. */
  summary: string;
  fields: {
    label: string;
    value: string;
    mono?: boolean;
    wide?: boolean;
  }[];
};

export function VisitList({ visits }: { visits: VisitCard[] }) {
  return (
    <ul className="divide-y divide-[var(--border)]">
      {visits.map((visit) => (
        <VisitRow key={visit.id} visit={visit} />
      ))}
    </ul>
  );
}

function VisitRow({ visit }: { visit: VisitCard }) {
  const [open, setOpen] = useState(false);
  const detailsId = `visit-details-${visit.id}`;

  return (
    <li className="px-4 py-3 sm:px-5 sm:py-4">
      <div className="hidden items-start justify-between gap-x-3 gap-y-2 md:flex md:flex-wrap">
        <a
          href={visit.path}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 font-mono text-sm font-semibold break-all hover:text-primary"
        >
          {visit.path}
        </a>
        <div className="flex flex-wrap items-center gap-2">
          <Reading crawler={visit.crawler} />
          <time className="text-[11px] tabular-nums text-[var(--foreground)]/50">
            {visit.time}
          </time>
        </div>
        {visit.reasons.length > 0 ? (
          <Reasons reasons={visit.reasons} className="basis-full" />
        ) : null}
      </div>

      <button
        type="button"
        className="flex w-full items-start gap-3 text-left md:hidden"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-xs font-semibold break-all">
            {visit.path}
          </span>
          <span className="mt-1 block text-xs text-[var(--foreground)]/60">
            {visit.summary}
          </span>
          {visit.reasons.length > 0 ? <Reasons reasons={visit.reasons} /> : null}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <Reading crawler={visit.crawler} />
          <time className="text-[11px] tabular-nums text-[var(--foreground)]/50">
            {visit.time}
          </time>
          <ChevronDown
            aria-hidden
            className={cn(
              "h-4 w-4 text-[var(--foreground)]/40 transition-transform",
              open && "rotate-180",
            )}
          />
        </span>
      </button>

      <div id={detailsId} className={open ? "mt-3" : "mt-3 hidden md:block"}>
        <a
          href={visit.path}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-3 inline-block text-xs font-semibold text-primary md:hidden"
        >
          Open page
        </a>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {visit.fields.map((field) => (
            <div
              key={field.label}
              className={field.wide ? "sm:col-span-2" : undefined}
            >
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--foreground)]/40">
                {field.label}
              </dt>
              <dd
                className={cn(
                  "mt-0.5 text-xs text-[var(--foreground)]/80",
                  field.mono && "font-mono break-all",
                  !field.mono && "break-words",
                )}
              >
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </li>
  );
}

function Reasons({
  reasons,
  className,
}: {
  reasons: string[];
  className?: string;
}) {
  return (
    <span className={cn("mt-1 block text-[11px] leading-snug text-amber-800", className)}>
      {reasons.join(" · ")}
    </span>
  );
}

function Reading({ crawler }: { crawler: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold",
        crawler
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-emerald-200 bg-emerald-50 text-emerald-900",
      )}
    >
      {crawler ? "Crawler" : "Shopper"}
    </span>
  );
}

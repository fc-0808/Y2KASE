"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  CheckCircle2,
  Eye,
  CopyCheck,
  Sparkles,
  FolderOpen,
  XCircle,
} from "lucide-react";

type Progress = {
  exists: boolean;
  done: boolean;
  crashed?: boolean;
  errorMessage?: string;
  total?: number;
  processed?: number;
  created?: number;
  skipped?: number;
  failed?: number;
  duplicates?: number;
  autoTyped?: number;
  currentIndex?: number;
  current?: string;
  tail?: string[];
};

export function IngestProgress({
  logFile,
  dir,
  type,
}: {
  logFile: string;
  dir: string;
  type: string;
}) {
  const [p, setP] = useState<Progress | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const r = await fetch(
          `/api/admin/ingest-log?file=${encodeURIComponent(logFile)}`,
        );
        const d: Progress = await r.json();
        if (!active) return;
        setP(d);
        if (!d.done && !d.crashed) timer = setTimeout(poll, 1500);
      } catch {
        if (active) timer = setTimeout(poll, 2500);
      }
    };
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [logFile]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [p?.tail]);

  const total = p?.total ?? 0;
  const processed = p?.processed ?? 0;
  const done = p?.done ?? false;
  const crashed = p?.crashed ?? false;
  const pct =
    total > 0
      ? Math.min(100, Math.round((processed / total) * 100))
      : done
        ? 100
        : 0;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        {done ? (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-green-100 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
          </span>
        ) : crashed ? (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-100 text-red-600">
            <XCircle className="h-5 w-5" />
          </span>
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">
            {done
              ? "Ingest complete"
              : crashed
                ? "Ingest failed"
                : "Ingesting…"}
          </p>
          <p className="flex items-center gap-1 truncate text-xs text-[var(--foreground)]/55">
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{dir}</span>
            <span className="shrink-0">· {type}</span>
          </p>
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums">{pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            crashed
              ? "bg-red-500"
              : done
                ? "bg-green-500"
                : "bg-[var(--primary)]"
          }`}
          style={{ width: `${crashed ? 100 : pct}%` }}
        />
      </div>
      {crashed ? (
        <p className="mt-1.5 text-xs font-semibold text-red-600">
          {p?.errorMessage ??
            "The ingest stopped unexpectedly. See the log below."}
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-[var(--foreground)]/55">
          {!p?.exists
            ? "Starting…"
            : done
              ? `Processed ${processed} of ${total || processed}.`
              : p?.current
                ? `Processing ${p.currentIndex}/${total}: ${p.current}`
                : `Discovered ${total} product folder${total === 1 ? "" : "s"}…`}
        </p>
      )}

      {/* Stat chips */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Created" value={p?.created ?? 0} tone="text-green-700" />
        <Stat label="Skipped" value={p?.skipped ?? 0} />
        <Stat
          label="Failed"
          value={p?.failed ?? 0}
          tone={p?.failed ? "text-red-600" : undefined}
        />
        <Stat
          label="Duplicates"
          value={p?.duplicates ?? 0}
          tone={p?.duplicates ? "text-amber-600" : undefined}
        />
      </div>

      {(p?.autoTyped ?? 0) > 0 && (
        <p className="mt-2 flex items-center gap-1 text-xs font-medium text-[var(--foreground)]/55">
          <Sparkles className="h-3.5 w-3.5" /> {p?.autoTyped} classified by AI
        </p>
      )}

      {/* Live log */}
      {p?.tail && p.tail.length > 0 && (
        <div
          ref={logRef}
          className="mt-4 max-h-44 overflow-y-auto rounded-xl bg-[var(--muted)] p-3 font-mono text-[11px] leading-relaxed text-[var(--foreground)]/70"
        >
          {p.tail.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-words">
              {line}
            </div>
          ))}
        </div>
      )}

      {/* Completion actions */}
      {done && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/admin/products"
            className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
          >
            <Eye className="h-4 w-4" /> Review drafts
          </Link>
          {(p?.duplicates ?? 0) > 0 && (
            <Link
              href="/admin/products/duplicates"
              className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:border-[var(--primary)]"
            >
              <CopyCheck className="h-4 w-4" /> Review {p?.duplicates} duplicate
              {p?.duplicates === 1 ? "" : "s"}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] px-3 py-2">
      <p className={`text-lg font-black tabular-nums ${tone ?? ""}`}>{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--foreground)]/45">
        {label}
      </p>
    </div>
  );
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ActiveCatalogJob } from "@/lib/catalog/job-types";
import { IngestProgress } from "./IngestProgress";

const LOG_RE = /^(ingest|classify)-\d+\.log$/;

type CatalogJobContextValue = {
  busy: boolean;
  job: ActiveCatalogJob | null;
  reportJob: (job: ActiveCatalogJob) => void;
};

const CatalogJobContext = createContext<CatalogJobContextValue>({
  busy: false,
  job: null,
  reportJob: () => {},
});

export function RunningJobNote() {
  const { busy, job } = useCatalogJob();
  if (!busy) return null;
  const label = job?.kind === "classify" ? "Classification" : "Ingest";
  return (
    <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      {label} is running
      {job?.dir ? (
        <>
          {" "}
          on <span className="break-all font-mono text-xs">{job.dir}</span>
        </>
      ) : null}
      . Live progress stays pinned to the bottom of the screen.
    </p>
  );
}

export function useCatalogJob(): CatalogJobContextValue {
  return useContext(CatalogJobContext);
}

export function UploadConsole({
  initialJob,
  children,
}: {
  initialJob: ActiveCatalogJob | null;
  children: React.ReactNode;
}) {
  const [job, setJob] = useState<ActiveCatalogJob | null>(initialJob);
  const [lockHeld, setLockHeld] = useState(Boolean(initialJob?.running));
  const [dismissedLog, setDismissedLog] = useState<string | null>(null);
  const [dockHeight, setDockHeight] = useState(0);
  const dockRef = useRef<HTMLDivElement>(null);

  const reportJob = useCallback((next: ActiveCatalogJob) => {
    setJob(next);
    setLockHeld(true);
    setDismissedLog(null);
  }, []);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch("/api/admin/catalog-job", {
          cache: "no-store",
        });
        if (response.ok) {
          const data = (await response.json()) as {
            job: ActiveCatalogJob | null;
          };
          if (!active) return;
          if (data.job?.running) {
            setDismissedLog((prev) =>
              prev && prev !== data.job?.logFile ? null : prev,
            );
            setJob(data.job);
            setLockHeld(true);
          } else {
            setLockHeld(false);
            if (data.job) {
              setJob((current) => current ?? data.job);
            }
          }
        }
      } catch {
        // Keep the last snapshot if the status request fails.
      }
      if (active) timer = setTimeout(poll, 2000);
    };
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  const dismissed = job !== null && dismissedLog !== null && job.logFile === dismissedLog;
  const visible = job !== null && !dismissed;
  const busy = lockHeld && !dismissed;

  useEffect(() => {
    const el = dockRef.current;
    if (!el || !visible) {
      setDockHeight(0);
      return;
    }
    const measure = () => setDockHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, job?.logFile]);

  return (
    <CatalogJobContext.Provider value={{ busy, job: visible ? job : null, reportJob }}>
      <div style={dockHeight > 0 ? { paddingBottom: dockHeight + 16 } : undefined}>
        {children}
      </div>
      {visible && job && (
        <div
          ref={dockRef}
          className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-[var(--primary)] bg-[var(--card)]/95 shadow-[0_-16px_40px_-28px_rgba(80,20,60,0.55)] backdrop-blur-md lg:left-64"
        >
          <div className="mx-auto max-h-[min(24rem,52vh)] w-full max-w-3xl overflow-y-auto px-4 py-4 sm:px-6">
            {LOG_RE.test(job.logFile) ? (
              <IngestProgress
                key={job.logFile}
                embedded
                logFile={job.logFile}
                dir={job.dir}
                type={job.type}
                kind={job.kind}
                startedAt={job.startedAt}
                onDismiss={
                  lockHeld
                    ? undefined
                    : () => setDismissedLog(job.logFile || dismissedLog)
                }
              />
            ) : (
              <p className="text-sm font-semibold">
                Starting the catalog job…
              </p>
            )}
          </div>
        </div>
      )}
    </CatalogJobContext.Provider>
  );
}

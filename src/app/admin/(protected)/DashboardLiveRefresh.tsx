"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Soft-refresh the dashboard while this tab is visible.
 *
 * Inbox and Social Studio use the same 60s cadence. A hidden tab must not
 * poll: each refresh queries Neon, and a query more often than every 5
 * minutes keeps the database from suspending.
 */
const REFRESH_MS = 60_000;

function updatedLabel(fetchedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - fetchedAt) / 1000));
  if (seconds < 10) return "Updated just now";
  if (seconds < 60) return `Updated ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Updated ${minutes}m ago`;
  return `Updated ${Math.floor(minutes / 60)}h ago`;
}

export function DashboardLiveRefresh({ fetchedAt }: { fetchedAt: number }) {
  const router = useRouter();
  const [now, setNow] = useState(fetchedAt);
  const inFlight = useRef(false);
  const generation = useRef(0);

  // New server data arrived (or the first paint). Drop the in-flight lock so
  // the next interval can run, and invalidate any safety timeout still pending.
  useEffect(() => {
    inFlight.current = false;
    generation.current += 1;
  }, [fetchedAt]);

  useEffect(() => {
    let timer = 0;

    const refresh = () => {
      if (document.hidden || inFlight.current) return;
      inFlight.current = true;
      const ticket = ++generation.current;
      router.refresh();
      // The dashboard query can take several seconds. If it never lands, release
      // the lock after one interval so a later tick can try again.
      window.setTimeout(() => {
        if (generation.current === ticket) inFlight.current = false;
      }, REFRESH_MS);
    };

    const arm = () => {
      window.clearInterval(timer);
      timer = window.setInterval(refresh, REFRESH_MS);
    };

    arm();

    const onVisible = () => {
      if (document.hidden) return;
      refresh();
      arm();
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <p className="mt-1 text-xs tabular-nums text-[var(--foreground)]/40">
      {updatedLabel(fetchedAt, now)}
    </p>
  );
}

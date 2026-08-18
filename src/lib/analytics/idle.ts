"use client";

/**
 * Run non-critical marketing work after the load event and during browser idle
 * time. The timeout prevents low-traffic pages from starving attribution
 * indefinitely, while cleanup keeps Strict Mode remounts from double-scheduling.
 */
export function scheduleAfterLoad(
  task: () => void,
  timeout = 2_500,
): () => void {
  let cancelled = false;
  let idleId: number | undefined;
  let timerId: ReturnType<typeof setTimeout> | undefined;

  const run = () => {
    if (!cancelled) task();
  };

  const schedule = () => {
    const requestIdle = window.requestIdleCallback;
    if (typeof requestIdle === "function") {
      idleId = requestIdle.call(window, run, { timeout });
    } else {
      timerId = globalThis.setTimeout(run, 0);
    }
  };

  if (document.readyState === "complete") {
    schedule();
  } else {
    window.addEventListener("load", schedule, { once: true });
  }

  return () => {
    cancelled = true;
    window.removeEventListener("load", schedule);
    if (idleId !== undefined) {
      window.cancelIdleCallback(idleId);
    }
    if (timerId !== undefined) globalThis.clearTimeout(timerId);
  };
}

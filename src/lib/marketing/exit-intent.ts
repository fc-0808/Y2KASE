/**
 * Top-edge exit intent — "the pointer just left the page for the browser
 * chrome", detected reliably enough to act on.
 *
 * WHY THIS IS NOT A ONE-LINE `clientY <= 0` CHECK
 * Browsers sample the pointer about once per animation frame, and the event
 * that reports the exit carries the last sample taken *inside* the document —
 * not the point where the pointer crossed the boundary. Someone reaching for
 * the close button, the tab strip or the address bar moves at roughly
 * 1,500–3,000 px/s, so at 60 Hz the final interior sample routinely sits
 * 25–50 px below the edge. A tight band therefore throws the gesture away
 * exactly when it is most deliberate: the faster the shopper leaves, the less
 * likely the old check was to notice.
 *
 * THE TWO PIECES OF EVIDENCE
 *  1. The pointer really has left the document. Only `mouseleave` on the root
 *     element, or a `mouseout` whose `relatedTarget` is null, can say that.
 *     Neither fires while the pointer is still over the page, which is what
 *     keeps a shopper reaching for the site's own header from being
 *     interrupted — the reason this detector never speculates about where an
 *     in-page pointer is headed.
 *  2. It left through the *top*. Either the reported point is already at the
 *     edge, or the recorded trajectory was climbing fast enough that no other
 *     edge explains the exit.
 *
 * Everything below the classifier is plumbing: pointer sampling, a re-entry
 * grace that swallows the synthetic exit some browsers emit when a window
 * regains focus, de-duplication of the two events that describe one gesture,
 * and teardown that cannot strand a listener.
 */

/** A report at or above this line needs no corroboration. */
const EDGE_PX = 24;

/** Below this line an exit is never attributed to the top edge. */
const TRAJECTORY_BAND_PX = 180;

/** Climb rate (px/s) that an incidental hand movement does not produce. */
const TRAJECTORY_SPEED_PX_PER_S = 300;

/** A report this close to a side edge is explained by that edge instead. */
const SIDE_EDGE_PX = 4;

/** Pointer samples older than this say nothing about the current gesture. */
const SAMPLE_WINDOW_MS = 220;

/** Bounds the buffer on high-polling-rate mice. */
const MAX_SAMPLES = 32;

/** Too short a baseline turns sampling jitter into a huge apparent speed. */
const MIN_TRAJECTORY_MS = 8;

/** Ignore exits reported this soon after the window regained the pointer. */
const REENTRY_GRACE_MS = 350;

/** `mouseleave` and `mouseout` both describe one gesture; report it once. */
const REFIRE_GUARD_MS = 1_000;

export type PointerExitReport = {
  /** Reported `clientX` of the exit. */
  x: number;
  /** Reported `clientY` of the exit. */
  y: number;
  viewportWidth: number;
  /** Recent upward speed in px/s. Zero when the trajectory is unknown. */
  upwardSpeed: number;
};

/**
 * Given that the pointer has left the document, did it leave through the top?
 *
 * Pure and exported so the decision can be pinned by `scripts/check-preview`
 * without a browser: the tuning below is the whole feature, and a silent drift
 * in it looks identical to the pop-up simply never firing.
 */
export function isTopEdgeExit(report: PointerExitReport): boolean {
  const { x, y, viewportWidth, upwardSpeed } = report;

  if (y > TRAJECTORY_BAND_PX) return false;
  if (y <= EDGE_PX) return true;

  // Deeper into the page the report is only trustworthy as the tail of a fast
  // upward move. Anything hugging a side edge is better explained by that
  // edge, so it is left to the side rather than claimed for the top.
  if (x <= SIDE_EDGE_PX || x >= viewportWidth - SIDE_EDGE_PX) return false;
  return upwardSpeed >= TRAJECTORY_SPEED_PX_PER_S;
}

/**
 * Can this device produce the gesture at all?
 *
 * A coarse pointer has no persistent cursor and no browser chrome to reach
 * for, so there is nothing to observe. Callers use this to pick their fallback
 * trigger rather than leaving cart-bearing touch shoppers with no trigger.
 */
export function supportsExitIntent(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export type ExitIntentOptions = {
  /** Called once per genuine top-edge exit. */
  onExitIntent: () => void;
  /**
   * Evaluated at gesture time. Returning false skips this exit without
   * consuming anything, so a later one is still observed.
   */
  shouldTrigger?: () => boolean;
};

/**
 * Watch for top-edge exits until the returned teardown is called.
 *
 * Safe in any environment: returns a no-op on the server and on devices that
 * cannot produce the gesture.
 */
export function observeTopEdgeExit(options: ExitIntentOptions): () => void {
  if (typeof document === "undefined" || !supportsExitIntent()) {
    return () => {};
  }

  const samples: { y: number; at: number }[] = [];
  let pointerReturnedAt = performance.now();
  let lastFiredAt = Number.NEGATIVE_INFINITY;

  function prune(at: number): void {
    while (samples.length > 0) {
      const oldest = samples[0];
      if (!oldest) break;
      if (samples.length <= MAX_SAMPLES && at - oldest.at <= SAMPLE_WINDOW_MS) {
        break;
      }
      samples.shift();
    }
  }

  /** Climb rate over the retained window, in px/s. Zero when descending. */
  function upwardSpeed(at: number, y: number): number {
    const oldest = samples[0];
    if (!oldest) return 0;

    const elapsed = at - oldest.at;
    if (elapsed < MIN_TRAJECTORY_MS) return 0;

    const rise = oldest.y - y;
    if (rise <= 0) return 0;
    return (rise / elapsed) * 1_000;
  }

  function handleMove(event: MouseEvent): void {
    const at = performance.now();
    samples.push({ y: event.clientY, at });
    prune(at);
  }

  /** The pointer is back (or the window is). Restart the trajectory record. */
  function handleReturn(): void {
    pointerReturnedAt = performance.now();
    samples.length = 0;
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === "visible") handleReturn();
  }

  function handleExit(event: MouseEvent): void {
    const at = performance.now();

    // Restoring focus to a window can synthesise an exit for a pointer that
    // never moved. Waiting out the grace costs nothing: a shopper who is
    // actually leaving is still leaving 350 ms later.
    if (at - pointerReturnedAt < REENTRY_GRACE_MS) return;
    if (at - lastFiredAt < REFIRE_GUARD_MS) return;
    if (document.visibilityState !== "visible") return;

    prune(at);
    const topEdge = isTopEdgeExit({
      x: event.clientX,
      y: event.clientY,
      viewportWidth: window.innerWidth,
      upwardSpeed: upwardSpeed(at, event.clientY),
    });
    if (!topEdge) return;
    if (options.shouldTrigger && !options.shouldTrigger()) return;

    lastFiredAt = at;
    options.onExitIntent();
  }

  /**
   * `mouseleave` on the root element is the clean signal, but it is not
   * emitted identically everywhere, so the bubbling `mouseout` is kept as a
   * second witness. A null `relatedTarget` is what separates leaving the
   * document from moving between two elements inside it.
   */
  function handleMouseOut(event: MouseEvent): void {
    if (event.relatedTarget !== null) return;
    handleExit(event);
  }

  const root = document.documentElement;
  root.addEventListener("mouseleave", handleExit);
  root.addEventListener("mouseenter", handleReturn);
  document.addEventListener("mouseout", handleMouseOut);
  document.addEventListener("mousemove", handleMove, { passive: true });
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("focus", handleReturn);

  return () => {
    root.removeEventListener("mouseleave", handleExit);
    root.removeEventListener("mouseenter", handleReturn);
    document.removeEventListener("mouseout", handleMouseOut);
    document.removeEventListener("mousemove", handleMove);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("focus", handleReturn);
  };
}

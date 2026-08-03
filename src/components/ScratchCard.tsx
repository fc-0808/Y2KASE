"use client";

/**
 * ScratchCard — a heart of holographic foil the shopper rubs away.
 *
 * The foil is a canvas painted over the prize and erased with a
 * `destination-out` brush wherever the pointer travels. Once enough of it is
 * gone the card gives up and reveals the rest, because making someone clear
 * every last pixel turns a two-second delight into a chore.
 *
 * IT DOES NOT DECIDE ANYTHING. The prize is drawn server-side before the first
 * stroke lands (see `@/lib/scratch`); this component is the theatre around a
 * result that already exists. That separation is what stops the outcome from
 * being re-rollable in devtools.
 *
 * ONE HEART, TWO RENDERERS
 * The silhouette is defined once as a unit-square path and consumed twice: as
 * an SVG `clipPath` in objectBoundingBox units (which shapes the background and
 * the contents, and scales with the element for free) and as a canvas `Path2D`
 * scaled to the bitmap (which bounds the foil). A single source keeps the two
 * from drifting — if they disagreed, foil would survive outside the visible
 * heart and the card could never finish.
 *
 * ACCESSIBILITY: scratching is a dragging movement, which WCAG 2.2 SC 2.5.7
 * requires a single-pointer alternative for — so the reveal button below the
 * card is not a fallback, it is part of the contract. It is rendered here
 * rather than left to the caller so it cannot be forgotten. The prize itself
 * lives in the DOM underneath the whole time and the canvas is `aria-hidden`,
 * so assistive tech never sees the foil at all.
 */

import { useCallback, useEffect, useRef } from "react";

/** Fraction of foil removed before the card reveals itself. */
const REVEAL_AT = 0.45;
/** Brush radius in CSS pixels. */
const BRUSH_RADIUS = 22;
/** Measure progress every Nth move — `getImageData` is too costly per-event. */
const SAMPLE_EVERY = 8;
/** Sample every Nth pixel when measuring, in each axis. */
const SAMPLE_STRIDE = 8;
/** Alpha at or above which a pixel still counts as covered by foil. */
const CLEAR_ALPHA = 32;

/** Mirrors --holo-vivid in globals.css; canvas can't read a CSS gradient. */
const FOIL_STOPS = ["#ffc2ea", "#e6c5ff", "#c4e2ff", "#c4ffe8", "#fff0c4"];

/**
 * The heart, in a unit square. Pure cubics on purpose: arcs distort badly when
 * an objectBoundingBox clip path is stretched to a non-square element, and this
 * card is deliberately taller than it is wide.
 */
const HEART_PATH =
  "M0.5,1 C0.5,1 0,0.62 0,0.3 C0,0.1 0.18,0 0.32,0 C0.42,0 0.48,0.06 0.5,0.12 C0.52,0.06 0.58,0 0.68,0 C0.82,0 1,0.1 1,0.3 C1,0.62 0.5,1 0.5,1 Z";

/**
 * A module constant rather than `useId()`: the pop-up mounts exactly one scratch
 * card, and `useId` values contain characters that are awkward inside a CSS
 * `url()` reference across browsers.
 */
const HEART_CLIP_ID = "y2k-scratch-heart";

type Point = { x: number; y: number };

export function ScratchCard({
  children,
  revealed,
  onFirstScratch,
  onReveal,
  revealLabel = "Reveal my prize instead",
}: {
  /** The prize, sitting under the foil. */
  children: React.ReactNode;
  /** Whether the prize is uncovered. Owned by the caller. */
  revealed: boolean;
  /** First contact with the foil — the caller uses this to start the draw. */
  onFirstScratch?: () => void;
  /** Enough foil is gone, or the reveal button was pressed. Fires at most once. */
  onReveal: () => void;
  revealLabel?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const scratching = useRef(false);
  const lastPoint = useRef<Point | null>(null);
  const moveCount = useRef(0);
  const hasStarted = useRef(false);
  const hasRevealed = useRef(false);

  /**
   * How many sampled pixels the foil covered when it was first painted.
   *
   * Progress is measured against THIS, not against the canvas area. A heart
   * fills only about two-thirds of its bounding box, so dividing by the box
   * would score the empty corners as already-scratched and the card would
   * auto-reveal after barely a stroke.
   */
  const paintedSamples = useRef(0);

  /** Sampled pixels still covered by foil. */
  const coveredSamples = useCallback((): number => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return 0;

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let covered = 0;
    for (let i = 3; i < data.length; i += SAMPLE_STRIDE * 4) {
      if (data[i] >= CLEAR_ALPHA) covered++;
    }
    return covered;
  }, []);

  // Paint the foil once. Sizing is captured on mount and not re-measured on
  // resize: re-initialising would wipe whatever the shopper had already
  // scratched, which is a far worse outcome than slight scaling after a device
  // rotation (the canvas is stretched by CSS to keep covering the prize).
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const rect = wrap.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Cap the pixel ratio: past 2× the extra pixels cost readback time during
    // measurement and buy nothing on a foil that is about to be destroyed.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    // No 2D context (ancient browser, canvas disabled) means no foil is ever
    // painted — the prize below is simply visible and the button still works.
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctxRef.current = ctx;
    paintFoil(ctx, rect.width, rect.height);
    paintedSamples.current = coveredSamples();
  }, [coveredSamples]);

  const finish = useCallback(() => {
    if (hasRevealed.current) return;
    hasRevealed.current = true;
    onReveal();
  }, [onReveal]);

  /** Fraction of the painted foil that has been erased. */
  const scratchedFraction = useCallback((): number => {
    const total = paintedSamples.current;
    if (total === 0) return 0;
    return 1 - coveredSamples() / total;
  }, [coveredSamples]);

  const erase = useCallback((to: Point) => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    ctx.globalCompositeOperation = "destination-out";

    // Stroke from the previous point so a fast drag erases a continuous band
    // instead of a dotted trail of discrete stamps.
    const from = lastPoint.current;
    if (from) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = BRUSH_RADIUS * 2;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(to.x, to.y, BRUSH_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    lastPoint.current = to;
  }, []);

  function localPoint(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (revealed || !ctxRef.current) return;
    // Capture so a drag that leaves the canvas keeps scratching, and doesn't
    // strand `scratching` in the on state when the pointer is released outside.
    e.currentTarget.setPointerCapture(e.pointerId);
    scratching.current = true;
    lastPoint.current = null;

    if (!hasStarted.current) {
      hasStarted.current = true;
      onFirstScratch?.();
    }
    erase(localPoint(e));
  }

  function handleMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!scratching.current || revealed) return;
    erase(localPoint(e));

    moveCount.current += 1;
    if (moveCount.current % SAMPLE_EVERY !== 0) return;
    if (scratchedFraction() >= REVEAL_AT) finish();
  }

  function handleUp() {
    if (!scratching.current) return;
    scratching.current = false;
    lastPoint.current = null;
    // Measure once on release: a short flick can cross the threshold between
    // two sampling ticks and would otherwise sit there looking broken.
    if (!revealed && scratchedFraction() >= REVEAL_AT) finish();
  }

  return (
    <div>
      {/* The clip path, defined once. objectBoundingBox units mean it stretches
          with the element, so the same markup works at every breakpoint. */}
      <svg aria-hidden="true" className="absolute h-0 w-0" focusable="false">
        <defs>
          <clipPath id={HEART_CLIP_ID} clipPathUnits="objectBoundingBox">
            <path d={HEART_PATH} />
          </clipPath>
        </defs>
      </svg>

      {/* The glow lives on the parent so the shadow follows the clipped heart's
          alpha. A shadow on the clipped element itself would be cut away with
          everything else outside the silhouette. */}
      <div
        className="mx-auto w-full max-w-[20rem]"
        style={{ filter: "drop-shadow(0 10px 18px rgba(255,62,165,0.28))" }}
      >
        <div
          ref={wrapRef}
          // Taller than wide, so the heart reads as a heart rather than a
          // squashed one, and so the widest band has room for the contents.
          className="relative aspect-[1/1.12] w-full bg-[var(--primary-soft)]"
          style={{ clipPath: `url(#${HEART_CLIP_ID})` }}
        >
          {/* Held clear of the lobes above and the point below, so the contents
              land in the widest part of the shape. The numbers are load-bearing:
              contents are 68% of the width and span from 16% to 70% of the
              height, which keeps the call-to-action entirely inside the heart's
              broad center instead of down near the tapering point. The layout is
              centered within that band so the button can be fully visible while
              still feeling embedded in the heart. */}
          <div className="absolute inset-x-[16%] bottom-[30%] top-[16%] grid place-items-center">
            {children}
          </div>

          <canvas
            ref={canvasRef}
            aria-hidden="true"
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
            // `touch-none` stops the browser claiming the gesture as a scroll,
            // which on mobile would otherwise make the foil almost unscratchable.
            className={`absolute inset-0 h-full w-full touch-none transition-opacity duration-500 motion-reduce:transition-none ${
              revealed
                ? "pointer-events-none opacity-0"
                : "cursor-grab opacity-100 active:cursor-grabbing"
            }`}
          />
        </div>
      </div>

      {!revealed && (
        <button
          type="button"
          onClick={finish}
          className="mt-2 w-full text-center text-xs font-semibold text-[var(--foreground)]/45 underline underline-offset-2 transition hover:text-[var(--primary)]"
        >
          {revealLabel}
        </button>
      )}
    </div>
  );
}

/**
 * Scale the unit heart onto the bitmap.
 *
 * Returns null where `Path2D.addPath` or `DOMMatrix` is unavailable; the caller
 * then paints the full rectangle instead. The CSS clip still shows a heart, and
 * because progress is measured against whatever was actually painted, the card
 * stays completable either way.
 */
function heartPathFor(width: number, height: number): Path2D | null {
  try {
    const scaled = new Path2D();
    scaled.addPath(new Path2D(HEART_PATH), new DOMMatrix([width, 0, 0, height, 0, 0]));
    return scaled;
  } catch {
    return null;
  }
}

/** Holographic foil with a diagonal sheen and a nudge to scratch it. */
function paintFoil(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx.save();

  // Confine the foil to the heart so the empty corners are never painted. That
  // is what lets progress be measured against painted pixels alone.
  const heart = heartPathFor(width, height);
  if (heart) ctx.clip(heart);

  const gradient = ctx.createLinearGradient(0, height, width, 0);
  FOIL_STOPS.forEach((stop, i) => {
    gradient.addColorStop(i / (FOIL_STOPS.length - 1), stop);
  });
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Diagonal streaks so the panel reads as metallic foil rather than a flat
  // pastel swatch — it has to look like something you're meant to rub off.
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 9;
  for (let x = -height; x < width + height; x += 26) {
    ctx.beginPath();
    ctx.moveTo(x, height);
    ctx.lineTo(x + height, 0);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // A system font stack, deliberately: a webfont may not have loaded when the
  // foil is painted, and canvas text does not re-render when it arrives.
  // Sits above centre, where the heart is widest.
  ctx.fillStyle = "rgba(52,32,59,0.75)";
  ctx.font =
    '800 14px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("SCRATCH ME ✨", width / 2, height * 0.42);

  ctx.restore();
}

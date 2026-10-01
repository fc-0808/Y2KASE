"use client";

/**
 * Crop and quarter-turn a gallery photo.
 *
 * The box lives in image pixels of the photo after the current rotation, which
 * is the same space the server extracts from. CSS only scales that frame to
 * fit the dialog, so a window resize never moves the composition.
 *
 * Apply uploads a new WebP immediately. The uploaded original is kept for Undo
 * and is not part of the bulk editor's unsaved draft.
 */
import { useEffect, useRef, useState } from "react";
import {
  Check,
  Loader2,
  RotateCcw,
  RotateCw,
  Undo2,
  X,
} from "lucide-react";
import {
  MIN_CROP_SIDE,
  fitAspect,
  isWholePhoto,
  moveRect,
  normaliseRotation,
  resizeRect,
  rotateRect,
  roundRect,
  type CropHandle,
  type ImageFrame,
  type ImageRect,
} from "@/lib/catalog/crop-geometry";
import {
  cropCatalogImage,
  restoreCatalogImage,
} from "./image-edit-actions";

const ASPECTS: { id: string; label: string; ratio: number | null }[] = [
  { id: "free", label: "Free", ratio: null },
  { id: "sq", label: "1:1", ratio: 1 },
  { id: "4x3", label: "4:3", ratio: 4 / 3 },
  { id: "3x4", label: "3:4", ratio: 3 / 4 },
  { id: "16x9", label: "16:9", ratio: 16 / 9 },
];

const HANDLES: { id: CropHandle; cursor: string; left: string; top: string }[] = [
  { id: "nw", cursor: "nwse-resize", left: "0%", top: "0%" },
  { id: "n", cursor: "ns-resize", left: "50%", top: "0%" },
  { id: "ne", cursor: "nesw-resize", left: "100%", top: "0%" },
  { id: "e", cursor: "ew-resize", left: "100%", top: "50%" },
  { id: "se", cursor: "nwse-resize", left: "100%", top: "100%" },
  { id: "s", cursor: "ns-resize", left: "50%", top: "100%" },
  { id: "sw", cursor: "nesw-resize", left: "0%", top: "100%" },
  { id: "w", cursor: "ew-resize", left: "0%", top: "50%" },
];

/** Short side below this reads soft in a search tile. Warn, don't block. */
const SMALL_OUTPUT = 1000;

type DragMode = "move" | "resize" | "draw";
type Drag = {
  mode: DragMode;
  handle: string;
  from: { x: number; y: number };
  origin: ImageRect;
  moved: boolean;
};

export function ImageCropStudio({
  productId,
  imageId,
  url,
  filename,
  originalUrl,
  onClose,
  onApplied,
}: {
  productId: number;
  imageId: number;
  url: string;
  filename: string | null;
  originalUrl: string | null;
  onClose: () => void;
  onApplied: (next: { url: string; originalUrl: string | null }) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const loadedUrl = useRef<string | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [rotation, setRotation] = useState(0);
  const [crop, setCrop] = useState<ImageRect | null>(null);
  const [aspectId, setAspectId] = useState("free");
  const [aspect, setAspect] = useState<number | null>(null);
  const [stageMax, setStageMax] = useState({ w: 520, h: 420 });
  const [busy, setBusy] = useState(false);
  const [broken, setBroken] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const frame: ImageFrame | null = nat
    ? {
        w: rotation === 90 || rotation === 270 ? nat.h : nat.w,
        h: rotation === 90 || rotation === 270 ? nat.w : nat.h,
      }
    : null;
  const scale =
    frame && frame.w > 0 && frame.h > 0
      ? Math.min(stageMax.w / frame.w, stageMax.h / frame.h)
      : 1;
  const canUndo = Boolean(originalUrl && originalUrl !== url);

  const latest = useRef<{
    busy: boolean;
    close: () => void;
    nudge: (event: KeyboardEvent) => void;
    apply: () => void;
  } | null>(null);

  const [trackedUrl, setTrackedUrl] = useState(url);
  if (trackedUrl !== url) {
    setTrackedUrl(url);
    setNat(null);
    setCrop(null);
    setBroken(false);
  }

  useEffect(() => {
    function measure() {
      const w = Math.min(520, Math.max(240, window.innerWidth - 48));
      const h = Math.min(420, Math.max(180, Math.round(window.innerHeight * 0.46)));
      setStageMax({ w, h });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const actions = latest.current;
      if (!actions) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (!actions.busy) actions.close();
        return;
      }
      if (actions.busy) return;
      if (e.key === "Enter") {
        const target = e.target instanceof Element ? e.target : null;
        if (target?.closest("button")) return;
        e.preventDefault();
        actions.apply();
        return;
      }
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        e.preventDefault();
        actions.nudge(e);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const w = e.currentTarget.naturalWidth;
    const h = e.currentTarget.naturalHeight;
    if (!w || !h) return;
    if (loadedUrl.current === url) return;
    loadedUrl.current = url;
    setNat({ w, h });
    setRotation(0);
    setAspectId("free");
    setAspect(null);
    setCrop({ x: 0, y: 0, w, h });
  }

  function toPoint(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const stage = stageRef.current;
    if (!stage || scale <= 0) return { x: 0, y: 0 };
    const box = stage.getBoundingClientRect();
    return {
      x: (e.clientX - box.left) / scale,
      y: (e.clientY - box.top) / scale,
    };
  }

  function begin(
    e: React.PointerEvent,
    mode: DragMode,
    handle: string,
  ) {
    if (!crop || busy) return;
    e.preventDefault();
    e.stopPropagation();
    stageRef.current?.setPointerCapture(e.pointerId);
    drag.current = {
      mode,
      handle,
      from: toPoint(e),
      origin: { ...crop },
      moved: false,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !frame) return;
    const at = toPoint(e);
    const travelled =
      Math.abs(at.x - d.from.x) * scale > 3 ||
      Math.abs(at.y - d.from.y) * scale > 3;
    if (travelled) d.moved = true;
    if (d.mode === "move") {
      setCrop(moveRect(d.origin, frame, at.x - d.from.x, at.y - d.from.y));
    } else if (d.mode === "resize") {
      setCrop(
        resizeRect(d.origin, frame, d.handle, at.x, at.y, MIN_CROP_SIDE, aspect),
      );
    } else if (d.moved) {
      const handle =
        (at.y < d.from.y ? "n" : "s") + (at.x < d.from.x ? "w" : "e");
      setCrop(
        resizeRect(
          { x: d.from.x, y: d.from.y, w: 0, h: 0 },
          frame,
          handle,
          at.x,
          at.y,
          MIN_CROP_SIDE,
          aspect,
        ),
      );
    }
  }

  function onPointerUp() {
    drag.current = null;
  }

  function turn(dir: 1 | -1) {
    if (!crop || !frame || busy) return;
    const turned = rotateRect(crop, frame, dir);
    setRotation((current) => normaliseRotation(current + dir * 90));
    setCrop(fitAspect(turned.rect, turned.frame, aspect));
    setNotice(null);
    setError(null);
  }

  function chooseAspect(id: string, ratio: number | null) {
    if (busy) return;
    setAspectId(id);
    setAspect(ratio);
    if (crop && frame) setCrop(fitAspect(crop, frame, ratio));
  }

  function reset() {
    if (!nat || busy) return;
    setRotation(0);
    setAspectId("free");
    setAspect(null);
    setCrop({ x: 0, y: 0, w: nat.w, h: nat.h });
    setNotice(null);
    setError(null);
  }

  function nudge(e: KeyboardEvent) {
    if (!crop || !frame) return;
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    setCrop(moveRect(crop, frame, dx, dy));
  }

  async function apply() {
    if (!crop || !frame || busy || broken) return;
    if (isWholePhoto(crop, frame, rotation)) {
      setError(null);
      setNotice("That selection is the whole photo, so nothing was rewritten.");
      return;
    }
    const rect = roundRect(crop, frame);
    setBusy(true);
    setError(null);
    try {
      const res = await cropCatalogImage({
        productId,
        imageId,
        ...rect,
        rotate: rotation,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setNotice(res.message);
      if (res.changed) onApplied({ url: res.url, originalUrl: res.originalUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not crop this photo.");
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!canUndo || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await restoreCatalogImage({ productId, imageId });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setNotice(res.message);
      if (res.changed) onApplied({ url: res.url, originalUrl: res.originalUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore this photo.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    latest.current = { busy, close: onClose, nudge, apply: () => void apply() };
  });

  const snapped = crop && frame ? roundRect(crop, frame) : null;
  const shortSide = snapped ? Math.min(snapped.width, snapped.height) : 0;
  const previewScale =
    snapped && snapped.width > 0 && snapped.height > 0
      ? Math.min(112 / snapped.width, 112 / snapped.height)
      : 1;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Crop photo"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-bold">Crop photo</p>
            <p className="truncate text-xs text-[var(--foreground)]/55">
              {filename ?? `Image #${imageId}`}
              {rotation ? ` · rotated ${rotation}°` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-[var(--muted)] disabled:opacity-40"
            aria-label="Close crop"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] px-4 py-2">
          <button
            type="button"
            onClick={() => turn(-1)}
            disabled={!nat || busy}
            className="grid h-8 w-8 place-items-center rounded-full border border-[var(--border)] hover:border-[var(--primary)] disabled:opacity-40"
            aria-label="Rotate left"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => turn(1)}
            disabled={!nat || busy}
            className="grid h-8 w-8 place-items-center rounded-full border border-[var(--border)] hover:border-[var(--primary)] disabled:opacity-40"
            aria-label="Rotate right"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={!nat || busy}
            className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-semibold hover:border-[var(--primary)] disabled:opacity-40"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => void undo()}
            disabled={!canUndo || busy}
            className="flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-semibold hover:border-[var(--primary)] disabled:opacity-40"
          >
            <Undo2 className="h-3.5 w-3.5" /> Undo
          </button>
          <span className="mx-1 hidden h-4 w-px bg-[var(--border)] sm:block" />
          {ASPECTS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => chooseAspect(preset.id, preset.ratio)}
              disabled={!nat || busy}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-40 ${
                aspectId === preset.id
                  ? "bg-[var(--primary)] text-white"
                  : "border border-[var(--border)] hover:border-[var(--primary)]"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[var(--muted)]/40 px-4 py-5">
          {broken ? (
            <p className="text-sm text-red-500">This photo could not be loaded.</p>
          ) : !nat || !frame || !crop ? (
            <div className="grid place-items-center text-[var(--foreground)]/50">
              <Loader2 className="h-5 w-5 animate-spin" />
              {/* Raw img: the crop box is measured from naturalWidth, which next/image does not expose. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                onLoad={onLoad}
                onError={() => setBroken(true)}
                className="sr-only"
              />
            </div>
          ) : (
            <div
              ref={stageRef}
              data-crop-stage=""
              className="relative touch-none select-none"
              style={{ width: frame.w * scale, height: frame.h * scale }}
              onPointerDown={(e) => {
                const target = e.target instanceof Element ? e.target : null;
                if (target?.closest("[data-crop-box]")) return;
                begin(e, "draw", "se");
              }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={filename ?? "Product photo"}
                draggable={false}
                onLoad={onLoad}
                onError={() => setBroken(true)}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
                style={{
                  width: nat.w * scale,
                  height: nat.h * scale,
                  transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                }}
              />
              <div
                className="pointer-events-none absolute inset-0 bg-black/50"
                style={{
                  clipPath: `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${crop.x * scale}px ${crop.y * scale}px, ${crop.x * scale}px ${(crop.y + crop.h) * scale}px, ${(crop.x + crop.w) * scale}px ${(crop.y + crop.h) * scale}px, ${(crop.x + crop.w) * scale}px ${crop.y * scale}px, ${crop.x * scale}px ${crop.y * scale}px)`,
                }}
              />
              <div
                data-crop-box=""
                className="absolute cursor-move touch-none border-2 border-white"
                style={{
                  left: crop.x * scale,
                  top: crop.y * scale,
                  width: Math.max(1, crop.w * scale),
                  height: Math.max(1, crop.h * scale),
                }}
                onPointerDown={(e) => begin(e, "move", "se")}
              >
                <div className="pointer-events-none absolute inset-0">
                  <span className="absolute inset-y-0 left-1/3 w-px bg-white/50" />
                  <span className="absolute inset-y-0 left-2/3 w-px bg-white/50" />
                  <span className="absolute inset-x-0 top-1/3 h-px bg-white/50" />
                  <span className="absolute inset-x-0 top-2/3 h-px bg-white/50" />
                </div>
                {HANDLES.map((handle) => (
                  <span
                    key={handle.id}
                    data-crop-box=""
                    role="presentation"
                    onPointerDown={(e) => begin(e, "resize", handle.id)}
                    className="absolute z-10 h-3.5 w-3.5 touch-none rounded-full border-2 border-[var(--primary)] bg-white"
                    style={{
                      left: handle.left,
                      top: handle.top,
                      transform: "translate(-50%, -50%)",
                      cursor: handle.cursor,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {snapped && frame && nat && (
              <div
                className="relative hidden shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-white sm:block"
                style={{
                  width: Math.max(1, snapped.width * previewScale),
                  height: Math.max(1, snapped.height * previewScale),
                }}
              >
                <div
                  className="absolute"
                  style={{
                    width: frame.w * previewScale,
                    height: frame.h * previewScale,
                    left: -snapped.left * previewScale,
                    top: -snapped.top * previewScale,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    draggable={false}
                    className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
                    style={{
                      width: nat.w * previewScale,
                      height: nat.h * previewScale,
                      transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                    }}
                  />
                </div>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold tabular-nums">
                {snapped
                  ? `${snapped.width} × ${snapped.height}`
                  : "Loading photo…"}
              </p>
              {snapped && shortSide < SMALL_OUTPUT && (
                <p className="text-[11px] font-medium text-amber-700">
                  Short side is under {SMALL_OUTPUT}px.
                </p>
              )}
              {error && (
                <p className="text-[11px] font-semibold text-red-500">{error}</p>
              )}
              {!error && notice && (
                <p className="text-[11px] font-semibold text-green-700">{notice}</p>
              )}
              {!error && !notice && (
                <p className="text-[11px] text-[var(--foreground)]/50">
                  Drag to draw. Arrows nudge, Shift moves 10px.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--foreground)]/70 hover:text-[var(--foreground)] disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void apply()}
              disabled={!crop || busy || broken}
              className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3.5 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Apply crop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

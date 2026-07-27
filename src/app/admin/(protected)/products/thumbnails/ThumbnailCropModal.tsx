"use client";

import { useRef, useState } from "react";
import { X, Check, Loader2 } from "lucide-react";

type Rect = { x: number; y: number; w: number; h: number };
type Handle = "move" | "nw" | "ne" | "sw" | "se";

/**
 * Manual crop tool for a generated thumbnail. The admin boxes just the case
 * (excluding any leftover background/props), and the selection is sent back as
 * fractions of the image so the server can re-crop + re-center it on white at
 * the standard size. Pointer-based; works with mouse and touch.
 */
export function ThumbnailCropModal({
  url,
  title,
  busy,
  onCancel,
  onApply,
}: {
  url: string;
  title: string;
  busy: boolean;
  onCancel: () => void;
  onApply: (rect: Rect) => void; // fractions 0–1
}) {
  const [disp, setDisp] = useState<{ w: number; h: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const drag = useRef<{ mode: Handle; sx: number; sy: number; orig: Rect } | null>(
    null,
  );

  function onImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const el = e.currentTarget;
    const w = el.clientWidth;
    const h = el.clientHeight;
    setDisp({ w, h });
    setRect({ x: w * 0.08, y: h * 0.04, w: w * 0.84, h: h * 0.92 });
  }

  function clampRect(r: Rect, d: { w: number; h: number }): Rect {
    let { x, y, w, h } = r;
    w = Math.max(24, w);
    h = Math.max(24, h);
    x = Math.max(0, Math.min(x, d.w - 24));
    y = Math.max(0, Math.min(y, d.h - 24));
    w = Math.min(w, d.w - x);
    h = Math.min(h, d.h - y);
    return { x, y, w, h };
  }

  const startDrag = (mode: Handle) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!rect) return;
    // The ref is only touched inside the returned pointer handler, never during
    // render — the rule can't see through the curried factory.
    // eslint-disable-next-line react-hooks/refs
    drag.current = { mode, sx: e.clientX, sy: e.clientY, orig: { ...rect } };
  };

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || !disp) return;
    const dx = e.clientX - drag.current.sx;
    const dy = e.clientY - drag.current.sy;
    const o = drag.current.orig;
    const m = drag.current.mode;
    let r: Rect;
    if (m === "move") r = { x: o.x + dx, y: o.y + dy, w: o.w, h: o.h };
    else if (m === "nw") r = { x: o.x + dx, y: o.y + dy, w: o.w - dx, h: o.h - dy };
    else if (m === "ne") r = { x: o.x, y: o.y + dy, w: o.w + dx, h: o.h - dy };
    else if (m === "sw") r = { x: o.x + dx, y: o.y, w: o.w - dx, h: o.h + dy };
    else r = { x: o.x, y: o.y, w: o.w + dx, h: o.h + dy };
    setRect(clampRect(r, disp));
  }

  function endDrag() {
    drag.current = null;
  }

  function apply() {
    if (!rect || !disp) return;
    onApply({
      x: rect.x / disp.w,
      y: rect.y / disp.h,
      w: rect.w / disp.w,
      h: rect.h / disp.h,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
    >
      <div className="max-h-[92vh] max-w-[92vw] overflow-auto rounded-2xl bg-[var(--card)] p-4 shadow-2xl">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="line-clamp-1 text-sm font-bold">Adjust thumbnail</h3>
          <button
            onClick={onCancel}
            className="rounded-full p-1.5 text-[var(--foreground)]/60 hover:bg-[var(--muted)]"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 line-clamp-1 text-xs text-[var(--foreground)]/60">
          {title} — drag the box around just the case, then Apply. It re-centers
          on white at the standard size.
        </p>

        <div className="relative inline-block select-none leading-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            onLoad={onImgLoad}
            draggable={false}
            className="block max-h-[68vh] max-w-full rounded-lg"
          />
          {rect && disp && (
            <div
              className="absolute border-2 border-[var(--primary)] shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
              style={{
                left: rect.x,
                top: rect.y,
                width: rect.w,
                height: rect.h,
                cursor: "move",
              }}
              onPointerDown={startDrag("move")}
            >
              {(["nw", "ne", "sw", "se"] as const).map((h) => (
                <span
                  key={h}
                  onPointerDown={startDrag(h)}
                  className="absolute h-3.5 w-3.5 rounded-full border-2 border-white bg-[var(--primary)]"
                  style={{
                    cursor: `${h}-resize`,
                    left: h.includes("w") ? -8 : undefined,
                    right: h.includes("e") ? -8 : undefined,
                    top: h.includes("n") ? -8 : undefined,
                    bottom: h.includes("s") ? -8 : undefined,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={busy || !rect}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

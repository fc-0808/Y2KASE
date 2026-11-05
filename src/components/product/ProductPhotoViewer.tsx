"use client";

/**
 * Fullscreen product photo.
 *
 * Listing tiles cover-crop into a shared frame, and the product-page stage
 * is a square, so neither surface can show every pixel of the file at a
 * useful size. Hover-zoom (the old desktop pattern) never fires for a finger,
 * and this catalog is shopped on a phone. Apple, Etsy, and Baymard's product-
 * image guidance therefore open a viewer on tap:
 *
 *   • The first view fits the whole file in the viewport (`object-contain`).
 *     Nothing is cropped. That is the entire product image.
 *   • A tap on the photo zooms in for print and charms. The next tap, or
 *     "Show entire image", returns to the fitted photo.
 *   • Pinch and the wheel zoom between those, and a drag pans while zoomed.
 *   • A horizontal swipe moves to the next photo only while the whole image
 *     is on screen, so a pan is never also a page turn.
 *
 * Same dialog contract as the filter sheet: scroll lock, focus trap, Escape,
 * restore focus, and the overlay lock so the chat bubble and sticky buy bar
 * step aside.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { ProductMedia } from "@/components/ProductMedia";
import {
  useBodyScrollLock,
  useModalFocusTrap,
} from "@/lib/hooks/use-modal-dialog";
import { useOverlayLock } from "@/lib/store/overlay";
import { cn } from "@/lib/utils";

export type ProductViewerSlide =
  | { kind: "image"; src: string; alt: string }
  | { kind: "video"; src: string };

const MAX_SCALE = 4;
const ZOOM_STEP = 2;
const SWIPE_PX = 48;
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black";

type Box = { width: number; height: number };
type Pan = { x: number; y: number };

function containSize(natural: Box | null, box: Box): Box {
  if (!natural || natural.width <= 0 || natural.height <= 0 || box.width <= 0) {
    return box;
  }
  const scale = Math.min(box.width / natural.width, box.height / natural.height);
  return { width: natural.width * scale, height: natural.height * scale };
}

function clampPan(pan: Pan, scale: number, box: Box, fitted: Box): Pan {
  if (scale <= 1) return { x: 0, y: 0 };
  const maxX = Math.max(0, (fitted.width * scale - box.width) / 2);
  const maxY = Math.max(0, (fitted.height * scale - box.height) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, pan.x)),
    y: Math.min(maxY, Math.max(-maxY, pan.y)),
  };
}

function subscribeToReducedMotion(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function reducedMotionSnapshot(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ProductPhotoViewer({
  open,
  slides,
  index,
  onIndexChange,
  onClose,
  productHref,
  onImageError,
}: {
  open: boolean;
  slides: ProductViewerSlide[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Listing tiles keep the product page one tap away from the photo. */
  productHref?: string;
  onImageError?: (src: string) => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const naturalRef = useRef<Box | null>(null);
  const scaleRef = useRef(1);
  const panRef = useRef<Pan>({ x: 0, y: 0 });
  const indexRef = useRef(0);
  const ignoreClick = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    startX: number;
    startY: number;
    moved: boolean;
    pinch: { distance: number; scale: number } | null;
    pinched: boolean;
    pan: { x: number; y: number; panX: number; panY: number } | null;
  } | null>(null);

  const lastIndex = Math.max(0, slides.length - 1);
  const safeIndex = Math.min(Math.max(0, index), lastIndex);
  const slide = slides[safeIndex];
  const isImage = slide?.kind === "image";

  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [settled, setSettled] = useState(true);
  const reduceMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    reducedMotionSnapshot,
    () => false,
  );

  const slideKey = slide ? `${slide.kind}:${slide.src}` : "";
  const [seenSlide, setSeenSlide] = useState(slideKey);
  if (seenSlide !== slideKey) {
    setSeenSlide(slideKey);
    setScale(1);
    setPan({ x: 0, y: 0 });
    setSettled(true);
  }

  useEffect(() => {
    scaleRef.current = scale;
    panRef.current = pan;
    indexRef.current = safeIndex;
  }, [scale, pan, safeIndex]);

  useEffect(() => {
    naturalRef.current = null;
    scaleRef.current = 1;
    panRef.current = { x: 0, y: 0 };
  }, [slideKey]);

  useBodyScrollLock(open);
  useOverlayLock("product-photo", open);
  useModalFocusTrap(dialogRef, open, onClose);

  const frameBox = useCallback((): Box => {
    const frame = frameRef.current;
    return {
      width: frame?.clientWidth ?? 0,
      height: frame?.clientHeight ?? 0,
    };
  }, []);

  const commitView = useCallback(
    (nextScale: number, nextPan: Pan) => {
      const box = frameBox();
      const fitted = containSize(naturalRef.current, box);
      const clamped = Math.min(MAX_SCALE, Math.max(1, nextScale));
      const panNext =
        clamped <= 1 ? { x: 0, y: 0 } : clampPan(nextPan, clamped, box, fitted);
      scaleRef.current = clamped;
      panRef.current = panNext;
      setScale(clamped);
      setPan(panNext);
    },
    [frameBox],
  );

  useEffect(() => {
    if (!open || !isImage) return;
    const frame = frameRef.current;
    if (!frame) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const direction = event.deltaY > 0 ? -0.35 : 0.35;
      setSettled(true);
      commitView(scaleRef.current + direction, panRef.current);
    }
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [commitView, isImage, open, slideKey]);

  const go = useCallback(
    (delta: number) => {
      if (slides.length < 2) return;
      const next = Math.min(lastIndex, Math.max(0, indexRef.current + delta));
      if (next !== indexRef.current) onIndexChange(next);
    },
    [lastIndex, onIndexChange, slides.length],
  );

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (!dialogRef.current?.contains(event.target as Node)) return;
      event.preventDefault();
      go(event.key === "ArrowLeft" ? -1 : 1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, open]);

  function toggleZoom() {
    setSettled(true);
    commitView(scaleRef.current > 1 ? 1 : ZOOM_STEP, { x: 0, y: 0 });
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isImage) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setSettled(false);
    if (pointers.current.size === 1) {
      gesture.current = {
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        pinch: null,
        pinched: false,
        pan:
          scaleRef.current > 1
            ? {
                x: event.clientX,
                y: event.clientY,
                panX: panRef.current.x,
                panY: panRef.current.y,
              }
            : null,
      };
      return;
    }
    if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinched = true;
      gesture.current.pinch = {
        distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        scale: scaleRef.current,
      };
      gesture.current.pan = null;
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const origin = gesture.current;
    if (!origin || !pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (
      Math.hypot(event.clientX - origin.startX, event.clientY - origin.startY) > 6
    ) {
      origin.moved = true;
    }
    if (pointers.current.size >= 2 && origin.pinch) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      commitView(origin.pinch.scale * (distance / origin.pinch.distance), panRef.current);
      return;
    }
    if (origin.pan && scaleRef.current > 1) {
      commitView(scaleRef.current, {
        x: origin.pan.panX + (event.clientX - origin.pan.x),
        y: origin.pan.panY + (event.clientY - origin.pan.y),
      });
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const origin = gesture.current;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size >= 2) return;
    if (pointers.current.size === 1) {
      if (origin) origin.pinch = null;
      return;
    }
    if (origin?.moved) {
      ignoreClick.current = true;
      window.setTimeout(() => {
        ignoreClick.current = false;
      }, 0);
      if (!origin.pinched && scaleRef.current <= 1) {
        const dx = event.clientX - origin.startX;
        const dy = event.clientY - origin.startY;
        if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
          go(dx < 0 ? 1 : -1);
        }
      }
    }
    gesture.current = null;
    setSettled(true);
  }

  function pointOnImage(clientX: number, clientY: number): boolean {
    const frame = frameRef.current;
    if (!frame) return true;
    const rect = frame.getBoundingClientRect();
    const fitted = containSize(naturalRef.current, {
      width: rect.width,
      height: rect.height,
    });
    const current = scaleRef.current;
    const shift = panRef.current;
    const cx = rect.left + rect.width / 2 + shift.x;
    const cy = rect.top + rect.height / 2 + shift.y;
    const halfW = (fitted.width * current) / 2;
    const halfH = (fitted.height * current) / 2;
    return (
      clientX >= cx - halfW &&
      clientX <= cx + halfW &&
      clientY >= cy - halfH &&
      clientY <= cy + halfH
    );
  }

  function onFrameClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!isImage) return;
    if (ignoreClick.current) {
      ignoreClick.current = false;
      return;
    }
    if (!pointOnImage(event.clientX, event.clientY)) {
      onClose();
      return;
    }
    toggleZoom();
  }

  if (!open || !slide || typeof document === "undefined") return null;

  const label =
    slide.kind === "image"
      ? slides.length > 1
        ? `${slide.alt || "Product photo"}, ${safeIndex + 1} of ${slides.length}`
        : slide.alt || "Product photo"
      : `Product video, ${safeIndex + 1} of ${slides.length}`;
  const zoomed = scale > 1;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed inset-0 z-[80] flex flex-col bg-[#1c1218]/92 text-white outline-none"
    >
      <h2 id={titleId} className="sr-only">
        {label}
      </h2>
      <div className="flex shrink-0 items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <p
          aria-live="polite"
          className="min-w-0 flex-1 text-sm font-bold tabular-nums text-white/80"
        >
          {slides.length > 1 ? `${safeIndex + 1} / ${slides.length}` : "Entire image"}
        </p>
        {isImage && (
          <button
            type="button"
            onClick={toggleZoom}
            aria-label={zoomed ? "Show entire image" : "Zoom in"}
            className={cn(
              "grid size-11 place-items-center rounded-full bg-white/15 transition hover:bg-white/25",
              FOCUS_RING,
            )}
          >
            {zoomed ? (
              <ZoomOut className="size-5" strokeWidth={2.4} />
            ) : (
              <ZoomIn className="size-5" strokeWidth={2.4} />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={cn(
            "grid size-11 place-items-center rounded-full bg-white text-[#1c1218] transition hover:bg-white/90",
            FOCUS_RING,
          )}
        >
          <X className="size-5" strokeWidth={2.4} />
        </button>
      </div>

      <div
        className="relative min-h-0 flex-1"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        {slides.length > 1 && (
          <button
            type="button"
            aria-label="Previous photo"
            disabled={safeIndex <= 0}
            onClick={() => go(-1)}
            className={cn(
              "absolute left-2 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full",
              "bg-white text-[#1c1218] shadow-sm transition hover:bg-white/90",
              "disabled:pointer-events-none disabled:opacity-30",
              FOCUS_RING,
            )}
          >
            <ChevronLeft className="size-5" strokeWidth={2.4} />
          </button>
        )}
        <div
          ref={frameRef}
          className={cn(
            "absolute inset-3 overflow-hidden sm:inset-6",
            isImage && (zoomed ? "cursor-zoom-out" : "cursor-zoom-in"),
            isImage && "touch-none",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={onFrameClick}
          onDragStart={(event) => event.preventDefault()}
        >
          {slide.kind === "video" ? (
            <video
              key={slide.src}
              src={slide.src}
              className="h-full w-full object-contain"
              controls
              autoPlay
              muted
              loop
              playsInline
              onError={() => onImageError?.(slide.src)}
            />
          ) : (
            <div
              className="pointer-events-none h-full w-full"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                transition:
                  settled && !reduceMotion ? "transform 160ms ease" : "none",
              }}
            >
              <ProductMedia
                key={slide.src}
                src={slide.src}
                alt={slide.alt}
                fit="contain"
                matte={false}
                sizes="100vw"
                loading="eager"
                fetchPriority="high"
                className="h-full w-full"
                onImageError={onImageError}
                onLoad={(size) => {
                  naturalRef.current = size;
                }}
              />
            </div>
          )}
        </div>
        {slides.length > 1 && (
          <button
            type="button"
            aria-label="Next photo"
            disabled={safeIndex >= lastIndex}
            onClick={() => go(1)}
            className={cn(
              "absolute right-2 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full",
              "bg-white text-[#1c1218] shadow-sm transition hover:bg-white/90",
              "disabled:pointer-events-none disabled:opacity-30",
              FOCUS_RING,
            )}
          >
            <ChevronRight className="size-5" strokeWidth={2.4} />
          </button>
        )}
      </div>

      {productHref ? (
        <div className="flex shrink-0 justify-center px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Link
            href={productHref}
            prefetch={false}
            className={cn(
              "inline-flex min-h-11 items-center justify-center rounded-full bg-white px-5",
              "text-sm font-extrabold text-[#1c1218] transition hover:bg-white/90",
              FOCUS_RING,
            )}
          >
            View product
          </Link>
        </div>
      ) : (
        <div className="h-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0" />
      )}
    </div>,
    document.body,
  );
}

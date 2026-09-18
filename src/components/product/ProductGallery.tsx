"use client";

/**
 * PDP media gallery.
 *
 * Tiny pagination dots are the wrong control once a listing has more than a
 * handful of photos. Baymard (page-control + guideline 774) and WCAG 2.2
 * 2.5.8 both fail that pattern: 8px dots cannot be targeted reliably, and
 * beyond ~7 indicators they stop communicating position. Amazon, Nike and
 * most top-quartile desktops therefore use a thumbnail rail as the primary
 * navigator, stage prev/next as the sequential control, and a numbered
 * "3 / 12" readout instead of a dot row.
 *
 * Layout follows that research:
 *  • Desktop (`lg`) — vertical rail to the left of the stage (Amazon / Nike).
 *  • Smaller viewports — horizontal rail under the stage, swipe on the photo.
 *  • Overflow is signposted with edge arrows + a fade, never a hidden
 *    scrollbar with no cue (the failure Baymard documents as "truncated
 *    thumbnails").
 *  • Hit targets are ≥ 44×44px on the stage and ≥ 36×36px on the rail, so
 *    jumping to the last photo is a click, not a pixel hunt.
 *
 * Keyboard: Left/Right and Up/Down step the gallery; Home/End jump. Thumb
 * buttons use roving tabindex so a 12-image listing is not 12 Tab stops.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Play,
} from "lucide-react";
import { ProductMedia } from "@/components/ProductMedia";
import { cn } from "@/lib/utils";

export type ProductGallerySlide =
  | { kind: "image"; id: number; url: string; alt: string }
  | { kind: "video"; url: string };

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2";

const SWIPE_PX = 48;

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function scrollBehavior(): ScrollBehavior {
  return reducedMotion() ? "auto" : "smooth";
}

function railOverflow(el: HTMLElement): {
  axis: "x" | "y";
  start: boolean;
  end: boolean;
} {
  const y = el.scrollHeight - el.clientHeight;
  const x = el.scrollWidth - el.clientWidth;
  if (y > x && y > 4) {
    return { axis: "y", start: el.scrollTop > 2, end: el.scrollTop < y - 2 };
  }
  return { axis: "x", start: el.scrollLeft > 2, end: el.scrollLeft < x - 2 };
}

/** Scroll the rail only — never the page — so a selected thumb comes into view. */
function scrollChildIntoRail(rail: HTMLElement, child: HTMLElement) {
  const railBox = rail.getBoundingClientRect();
  const childBox = child.getBoundingClientRect();
  const pad = 40;
  const dy =
    childBox.top < railBox.top + pad
      ? childBox.top - railBox.top - pad
      : childBox.bottom > railBox.bottom - pad
        ? childBox.bottom - railBox.bottom + pad
        : 0;
  const dx =
    childBox.left < railBox.left + pad
      ? childBox.left - railBox.left - pad
      : childBox.right > railBox.right - pad
        ? childBox.right - railBox.right + pad
        : 0;
  if (dx !== 0 || dy !== 0) {
    rail.scrollBy({ left: dx, top: dy, behavior: scrollBehavior() });
  }
}

function slideKey(slide: ProductGallerySlide): string {
  return slide.kind === "video" ? `video-${slide.url}` : `img-${slide.id}`;
}

function slideLabel(slide: ProductGallerySlide, index: number, total: number): string {
  const kind = slide.kind === "video" ? "product video" : "product photo";
  return `${kind} ${index + 1} of ${total}`;
}

export function ProductGallery({
  slides,
  activeIndex,
  onActiveIndexChange,
  onImageError,
}: {
  slides: ProductGallerySlide[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onImageError: (url: string) => void;
}) {
  const uid = useId();
  const panelId = `${uid}-panel`;
  const railRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const swipeOrigin = useRef<{ x: number; y: number } | null>(null);
  const [rail, setRail] = useState<{
    axis: "x" | "y";
    start: boolean;
    end: boolean;
  }>({ axis: "x", start: false, end: false });

  const lastIndex = Math.max(0, slides.length - 1);
  const current = slides[Math.min(activeIndex, lastIndex)] ?? slides[0];
  const hasStrip = slides.length > 1;
  const atStart = activeIndex <= 0;
  const atEnd = activeIndex >= lastIndex;

  const posterUrl = useMemo(() => {
    const image = slides.find((slide) => slide.kind === "image");
    return image?.kind === "image" ? image.url : null;
  }, [slides]);

  const goTo = useCallback(
    (index: number) => {
      if (slides.length === 0) return;
      const next = Math.max(0, Math.min(index, slides.length - 1));
      if (next !== activeIndex) onActiveIndexChange(next);
    },
    [activeIndex, onActiveIndexChange, slides.length],
  );

  const measureRail = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const next = railOverflow(el);
    setRail((prev) =>
      prev.axis === next.axis && prev.start === next.start && prev.end === next.end
        ? prev
        : next,
    );
  }, []);

  useEffect(() => {
    const el = railRef.current;
    if (!el || !hasStrip) return;
    measureRail();
    el.addEventListener("scroll", measureRail, { passive: true });
    const observer = new ResizeObserver(measureRail);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measureRail);
      observer.disconnect();
    };
  }, [hasStrip, measureRail, slides.length]);

  useEffect(() => {
    if (!hasStrip) return;
    const railEl = railRef.current;
    const thumb = thumbRefs.current[activeIndex];
    if (!railEl || !thumb) return;
    scrollChildIntoRail(railEl, thumb);
  }, [activeIndex, hasStrip, rail.axis]);

  function scrollRail(direction: 1 | -1) {
    const el = railRef.current;
    if (!el) return;
    const { axis } = railOverflow(el);
    const delta = direction * (axis === "y" ? el.clientHeight : el.clientWidth) * 0.75;
    el.scrollBy({
      left: axis === "x" ? delta : 0,
      top: axis === "y" ? delta : 0,
      behavior: scrollBehavior(),
    });
  }

  function onGalleryKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.closest("video")) return;
    const { key } = event;
    if (key === "ArrowLeft" || key === "ArrowUp") {
      event.preventDefault();
      goTo(activeIndex - 1);
      thumbRefs.current[Math.max(0, activeIndex - 1)]?.focus();
    } else if (key === "ArrowRight" || key === "ArrowDown") {
      event.preventDefault();
      goTo(activeIndex + 1);
      thumbRefs.current[Math.min(lastIndex, activeIndex + 1)]?.focus();
    } else if (key === "Home") {
      event.preventDefault();
      goTo(0);
      thumbRefs.current[0]?.focus();
    } else if (key === "End") {
      event.preventDefault();
      goTo(lastIndex);
      thumbRefs.current[lastIndex]?.focus();
    }
  }

  function onStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    if (event.target instanceof HTMLElement && event.target.closest("button, video")) {
      return;
    }
    swipeOrigin.current = { x: event.clientX, y: event.clientY };
  }

  function onStagePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const origin = swipeOrigin.current;
    swipeOrigin.current = null;
    if (!origin) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
    goTo(activeIndex + (dx < 0 ? 1 : -1));
  }

  function onThumbPointerEnter(
    event: ReactPointerEvent<HTMLButtonElement>,
    index: number,
  ) {
    // Amazon / Nike: a fine pointer hovering a thumb previews that photo.
    // Touch fires a synthetic mouseenter after tap — ignore anything that
    // is not a real mouse so a swipe cannot skip slides.
    if (event.pointerType !== "mouse") return;
    goTo(index);
  }

  return (
    <div
      className="relative flex min-w-0 flex-col gap-3"
      aria-roledescription="carousel"
      aria-label="Product photos"
      onKeyDown={onGalleryKeyDown}
    >
      <div
        className={cn(
          "relative aspect-square min-w-0 overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--product-surface)]",
          "touch-pan-y",
          hasStrip && "lg:ml-[6rem]",
        )}
        onPointerDown={onStagePointerDown}
        onPointerUp={onStagePointerEnd}
        onPointerCancel={() => {
          swipeOrigin.current = null;
        }}
        onClick={(event) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.closest("button, video")
          ) {
            return;
          }
          thumbRefs.current[activeIndex]?.focus({ preventScroll: true });
        }}
      >
        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={`${uid}-tab-${activeIndex}`}
          className="absolute inset-0"
        >
          {current?.kind === "video" ? (
            <video
              key={current.url}
              src={current.url}
              className="h-full w-full object-contain"
              controls
              autoPlay
              muted
              loop
              playsInline
              onError={() => onImageError(current.url)}
            />
          ) : current?.kind === "image" ? (
            <ProductMedia
              key={current.url}
              src={current.url}
              alt={current.alt}
              fit="contain"
              loading={activeIndex === 0 ? "eager" : "lazy"}
              fetchPriority={activeIndex === 0 ? "high" : "auto"}
              sizes="(max-width: 1024px) 100vw, 40vw"
              className="h-full w-full"
              onImageError={onImageError}
            />
          ) : (
            <div className="grid h-full place-items-center text-6xl">🎀</div>
          )}
        </div>

        {hasStrip && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              aria-controls={panelId}
              disabled={atStart}
              onClick={() => goTo(activeIndex - 1)}
              className={cn(
                "absolute left-2 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full",
                "border border-white/80 bg-white/90 text-[var(--foreground)] shadow-sm backdrop-blur-sm",
                "transition hover:bg-white hover:text-[var(--primary)]",
                FOCUS_RING,
                "disabled:pointer-events-none disabled:opacity-30",
              )}
            >
              <ChevronLeft className="size-5" strokeWidth={2.4} />
            </button>
            <button
              type="button"
              aria-label="Next photo"
              aria-controls={panelId}
              disabled={atEnd}
              onClick={() => goTo(activeIndex + 1)}
              className={cn(
                "absolute right-2 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full",
                "border border-white/80 bg-white/90 text-[var(--foreground)] shadow-sm backdrop-blur-sm",
                "transition hover:bg-white hover:text-[var(--primary)]",
                FOCUS_RING,
                "disabled:pointer-events-none disabled:opacity-30",
              )}
            >
              <ChevronRight className="size-5" strokeWidth={2.4} />
            </button>
            <p
              aria-hidden
              className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-[var(--foreground)]/55 px-2.5 py-1 text-xs font-bold tabular-nums tracking-wide text-white backdrop-blur-sm"
            >
              {activeIndex + 1} / {slides.length}
            </p>
          </>
        )}
      </div>

      {hasStrip && (
        <div className="relative min-w-0 lg:absolute lg:inset-y-0 lg:left-0 lg:w-[5.25rem]">
          <div
            ref={railRef}
            role="tablist"
            aria-label="Product photo thumbnails"
            aria-orientation={rail.axis === "y" ? "vertical" : "horizontal"}
            className={cn(
              "flex gap-2 overflow-x-auto overscroll-x-contain scroll-px-10 p-0.5",
              "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              "lg:h-full lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:overscroll-y-contain lg:scroll-px-0 lg:scroll-py-10",
            )}
          >
            {slides.map((slide, index) => {
              const selected = index === activeIndex;
              const tabId = `${uid}-tab-${index}`;
              return (
                <button
                  key={slideKey(slide)}
                  ref={(node) => {
                    thumbRefs.current[index] = node;
                  }}
                  type="button"
                  role="tab"
                  id={tabId}
                  aria-selected={selected}
                  aria-controls={panelId}
                  aria-label={slideLabel(slide, index, slides.length)}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => goTo(index)}
                  onPointerEnter={(event) => onThumbPointerEnter(event, index)}
                  onDragStart={(event) => event.preventDefault()}
                  className={cn(
                    "relative size-[4.5rem] shrink-0 overflow-hidden rounded-xl border-2 bg-[var(--product-surface)] sm:size-20",
                    "transition-[border-color,box-shadow] lg:size-[4.5rem] lg:min-h-[4.5rem]",
                    FOCUS_RING,
                    selected
                      ? "border-[var(--primary)] shadow-[0_0_0_1px_var(--primary)]"
                      : "border-transparent hover:border-[var(--foreground)]/20",
                  )}
                >
                  {slide.kind === "video" ? (
                    <>
                      {posterUrl ? (
                        <ProductMedia
                          src={posterUrl}
                          alt=""
                          fit="contain"
                          loading="lazy"
                          sizes="80px"
                          className="h-full w-full"
                          onImageError={onImageError}
                        />
                      ) : null}
                      <span className="absolute inset-0 grid place-items-center bg-black/30">
                        <Play className="size-4 fill-white text-white sm:size-5" />
                      </span>
                    </>
                  ) : (
                    <ProductMedia
                      src={slide.url}
                      alt=""
                      fit="contain"
                      loading="lazy"
                      sizes="80px"
                      className="h-full w-full"
                      onImageError={onImageError}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {rail.start && (
            <>
              <div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute z-[1] from-[var(--background)] to-transparent",
                  "inset-y-0 left-0 w-10 bg-gradient-to-r",
                  "lg:inset-x-0 lg:top-0 lg:h-10 lg:w-auto lg:bg-gradient-to-b",
                )}
              />
              <button
                type="button"
                aria-label="Show previous thumbnails"
                onClick={() => scrollRail(-1)}
                className={cn(
                  "absolute z-10 grid size-10 place-items-center rounded-full",
                  "border border-[var(--border)] bg-[var(--card)]/95 text-[var(--foreground)] shadow-sm",
                  "transition hover:border-[var(--primary)] hover:text-[var(--primary)]",
                  FOCUS_RING,
                  "left-0.5 top-1/2 -translate-y-1/2",
                  "lg:left-1/2 lg:top-0.5 lg:-translate-x-1/2 lg:translate-y-0",
                )}
              >
                <ChevronLeft className="size-4 lg:hidden" strokeWidth={2.4} />
                <ChevronUp className="hidden size-4 lg:block" strokeWidth={2.4} />
              </button>
            </>
          )}
          {rail.end && (
            <>
              <div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute z-[1] from-[var(--background)] to-transparent",
                  "inset-y-0 right-0 w-10 bg-gradient-to-l",
                  "lg:inset-x-0 lg:bottom-0 lg:top-auto lg:h-10 lg:w-auto lg:bg-gradient-to-t",
                )}
              />
              <button
                type="button"
                aria-label="Show more thumbnails"
                onClick={() => scrollRail(1)}
                className={cn(
                  "absolute z-10 grid size-10 place-items-center rounded-full",
                  "border border-[var(--border)] bg-[var(--card)]/95 text-[var(--foreground)] shadow-sm",
                  "transition hover:border-[var(--primary)] hover:text-[var(--primary)]",
                  FOCUS_RING,
                  "right-0.5 top-1/2 -translate-y-1/2",
                  "lg:bottom-0.5 lg:left-1/2 lg:right-auto lg:top-auto lg:-translate-x-1/2 lg:translate-y-0",
                )}
              >
                <ChevronRight className="size-4 lg:hidden" strokeWidth={2.4} />
                <ChevronDown className="hidden size-4 lg:block" strokeWidth={2.4} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

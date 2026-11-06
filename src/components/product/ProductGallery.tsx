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
 *  • A tap on the photo (or the expand control) opens {@link ProductPhotoViewer}
 *    so the whole file is on screen. The square stage cannot do that.
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
  Expand,
  Play,
} from "lucide-react";
import { ProductMedia } from "@/components/ProductMedia";
import {
  ProductPhotoViewer,
  type ProductViewerSlide,
} from "@/components/product/ProductPhotoViewer";
import { cn } from "@/lib/utils";

export type ProductGallerySlide =
  | { kind: "image"; id: number; url: string; alt: string }
  | { kind: "video"; url: string };

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2";

/** 44px hit target, small translucent face so the photo stays visible. */
const STAGE_ARROW = cn(
  "group absolute top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center",
  FOCUS_RING,
  "disabled:pointer-events-none disabled:opacity-25",
);
const STAGE_ARROW_FACE = cn(
  "grid size-7 place-items-center rounded-full",
  "bg-white/45 text-[var(--foreground)]/70 backdrop-blur-[2px]",
  "transition group-hover:bg-white/75 group-hover:text-[var(--foreground)]",
);
const RAIL_ARROW = cn(
  "group absolute z-10 grid size-9 place-items-center",
  FOCUS_RING,
);

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

/**
 * Width of a slide inside the stage. `100cqh * ratio` is the width that uses
 * the full stage height; `100%` is the full stage width. The smaller one
 * shows the whole file, so a phone-height cap never crops the case.
 */
function fittedWidth(mediaRatio: number): string {
  return `min(100%, calc(100cqh * ${mediaRatio}))`;
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
  const suppressStageClick = useRef(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [ratios, setRatios] = useState<Record<string, number>>({});
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
  // One frame for every slide, as wide as the screen. Squeezing that frame
  // shorter than the file leaves white bars beside the case. Wider slides
  // fit inside this frame; the hero fills it.
  const frameRatio = useMemo(() => {
    let tallest = Infinity;
    for (const slide of slides) {
      if (slide.kind !== "image") continue;
      const ratio = ratios[slide.url];
      if (ratio > 0 && ratio < tallest) tallest = ratio;
    }
    return Number.isFinite(tallest) ? tallest : 3 / 4;
  }, [ratios, slides]);
  const currentMediaUrl =
    current?.kind === "image" || current?.kind === "video" ? current.url : "";
  const currentRatio = currentMediaUrl ? ratios[currentMediaUrl] : undefined;

  const rememberRatio = useCallback((url: string, width: number, height: number) => {
    if (width <= 0 || height <= 0) return;
    const ratio = width / height;
    setRatios((prev) => (prev[url] === ratio ? prev : { ...prev, [url]: ratio }));
  }, []);

  const viewerSlides = useMemo<ProductViewerSlide[]>(
    () =>
      slides.map((slide) =>
        slide.kind === "video"
          ? { kind: "video", src: slide.url }
          : { kind: "image", src: slide.url, alt: slide.alt },
      ),
    [slides],
  );

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
    if (!(event.target instanceof Element)) return;
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
    // The chevron is an SVG, which is not an HTMLElement. A press on the
    // icon must still count as a press on its button. A swipe that starts
    // on the video must still change slides — the <video> fills the stage.
    if (event.target instanceof Element && event.target.closest("button")) {
      return;
    }
    const onVideo =
      event.target instanceof Element &&
      Boolean(event.target.closest("video, [data-video-swipe]"));
    swipeOrigin.current = { x: event.clientX, y: event.clientY };
    if (!onVideo) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The pointer can already be gone. The swipe still completes on pointerup.
    }
  }

  function onStagePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const origin = swipeOrigin.current;
    swipeOrigin.current = null;
    if (!origin) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
    // The synthetic click after a swipe must not also open the viewer.
    suppressStageClick.current = true;
    window.setTimeout(() => {
      suppressStageClick.current = false;
    }, 0);
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
          "relative min-w-0 overflow-hidden border border-[var(--border)] bg-[var(--product-surface)] max-md:-mx-4 max-md:rounded-none max-md:border-x-0 md:rounded-3xl",
          "pdp-stage transform-gpu touch-pan-y",
          hasStrip && "lg:ml-[6rem]",
          current?.kind === "image" && "cursor-zoom-in",
        )}
        style={{ aspectRatio: frameRatio }}
        onPointerDown={onStagePointerDown}
        onPointerUp={onStagePointerEnd}
        onPointerCancel={() => {
          swipeOrigin.current = null;
        }}
        onClick={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest("button, video")
          ) {
            return;
          }
          if (suppressStageClick.current) {
            suppressStageClick.current = false;
            return;
          }
          if (current?.kind === "image") {
            setViewerIndex(activeIndex);
            setViewerOpen(true);
          }
        }}
      >
        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={`${uid}-tab-${activeIndex}`}
          className="absolute inset-0 grid place-items-center"
        >
          <div
            className={cn(
              "relative max-h-full",
              current?.kind === "video" && "h-full min-h-0 w-full overflow-hidden",
            )}
            style={
              current?.kind === "video"
                ? undefined
                : currentRatio
                  ? {
                      aspectRatio: currentRatio,
                      width: fittedWidth(currentRatio),
                    }
                  : { width: "100%", height: "100%" }
            }
          >
            {current?.kind === "video" ? (
              <>
                <video
                  key={current.url}
                  src={current.url}
                  className="h-full w-full object-cover"
                  controls
                  autoPlay
                  muted
                  loop
                  playsInline
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget;
                    rememberRatio(current.url, video.videoWidth, video.videoHeight);
                  }}
                  onError={() => onImageError(current.url)}
                />
                {/* Swipes land on this layer. The native controls stay
                    reachable in the strip along the bottom. */}
                <div
                  data-video-swipe
                  className="absolute inset-x-0 top-0 bottom-12 z-[1] touch-pan-y"
                />
              </>
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
                onLoad={(size) => rememberRatio(current.url, size.width, size.height)}
                onImageError={onImageError}
              />
            ) : (
              <div className="grid h-full place-items-center text-6xl">🎀</div>
            )}

            {hasStrip && (
              <>
                <button
                  type="button"
                  aria-label="Previous photo"
                  aria-controls={panelId}
                  disabled={atStart}
                  onClick={(event) => {
                    event.stopPropagation();
                    goTo(activeIndex - 1);
                  }}
                  className={cn(STAGE_ARROW, "left-1")}
                >
                  <span className={STAGE_ARROW_FACE}>
                    <ChevronLeft className="size-3.5" strokeWidth={2.4} />
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  aria-controls={panelId}
                  disabled={atEnd}
                  onClick={(event) => {
                    event.stopPropagation();
                    goTo(activeIndex + 1);
                  }}
                  className={cn(STAGE_ARROW, "right-1")}
                >
                  <span className={STAGE_ARROW_FACE}>
                    <ChevronRight className="size-3.5" strokeWidth={2.4} />
                  </span>
                </button>
                <p
                  aria-hidden
                  className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-[var(--foreground)]/70 px-2.5 py-1 text-xs font-bold tabular-nums tracking-wide text-white"
                >
                  {activeIndex + 1} / {slides.length}
                </p>
              </>
            )}
            {current?.kind === "image" && (
              <button
                type="button"
                aria-label="View entire image"
                aria-haspopup="dialog"
                aria-expanded={viewerOpen}
                onClick={() => {
                  setViewerIndex(activeIndex);
                  setViewerOpen(true);
                }}
                className={cn(
                  "group absolute bottom-3 left-3 z-10 grid size-11 place-items-center",
                  FOCUS_RING,
                )}
              >
                <span className={STAGE_ARROW_FACE}>
                  <Expand className="size-3.5" strokeWidth={2.4} />
                </span>
              </button>
            )}
          </div>
        </div>
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
                      onLoad={(size) =>
                        rememberRatio(slide.url, size.width, size.height)
                      }
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
                  RAIL_ARROW,
                  "left-0 top-1/2 -translate-y-1/2",
                  "lg:left-1/2 lg:top-0 lg:-translate-x-1/2 lg:translate-y-0",
                )}
              >
                <span className={STAGE_ARROW_FACE}>
                  <ChevronLeft className="size-3.5 lg:hidden" strokeWidth={2.4} />
                  <ChevronUp className="hidden size-3.5 lg:block" strokeWidth={2.4} />
                </span>
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
                  RAIL_ARROW,
                  "right-0 top-1/2 -translate-y-1/2",
                  "lg:bottom-0 lg:left-1/2 lg:right-auto lg:top-auto lg:-translate-x-1/2 lg:translate-y-0",
                )}
              >
                <span className={STAGE_ARROW_FACE}>
                  <ChevronRight className="size-3.5 lg:hidden" strokeWidth={2.4} />
                  <ChevronDown className="hidden size-3.5 lg:block" strokeWidth={2.4} />
                </span>
              </button>
            </>
          )}
        </div>
      )}
      <ProductPhotoViewer
        open={viewerOpen}
        slides={viewerSlides}
        index={Math.min(viewerIndex, lastIndex)}
        onIndexChange={setViewerIndex}
        onClose={() => {
          goTo(viewerIndex);
          setViewerOpen(false);
        }}
        onImageError={onImageError}
      />
    </div>
  );
}

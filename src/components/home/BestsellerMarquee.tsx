"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductCard } from "@/components/ProductCard";
import type { ProductListItem } from "@/lib/products";

/**
 * A case should take about this long to travel its own width, on a phone
 * tile and on a desktop tile. Smaller cards would otherwise whip past.
 */
const SECONDS_PER_CARD = 3.8;

/** After a finger lifts, let the tap land and the flick finish before drifting. */
const HOLD_AFTER_TOUCH_MS = 1400;

/**
 * Bestsellers, one row on every width. The shelf drifts left once it is on
 * screen. A still cursor does not stop it. Moving the mouse, pressing, or
 * keyboard focus does, so a case can be opened. A finger pauses it for the
 * tap, and a swipe keeps control until the flick ends. Reduced motion leaves
 * the row still.
 */
export function BestsellerMarquee({ products }: { products: ProductListItem[] }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const halfRef = useRef<HTMLUListElement>(null);
  const offsetRef = useRef(0);
  const aimingRef = useRef(false);
  const focusedRef = useRef(false);
  const touchHoldRef = useRef(false);
  const speedRef = useRef(48);
  // Horizontal trackpad / shift-wheel / flick: hold the drift so it doesn't fight.
  const resumeAtRef = useRef(0);
  const [loop, setLoop] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    const half = halfRef.current;
    if (!viewport || !half) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    const measure = () => {
      const card = half.querySelector("li")?.getBoundingClientRect().width ?? 0;
      if (card > 0) speedRef.current = (card + 16) / SECONDS_PER_CARD;
      const overflow = half.offsetWidth > viewport.clientWidth + 8;
      setOverflows(overflow);
      setLoop(overflow && !reduce.matches);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    reduce.addEventListener("change", measure);
    return () => {
      observer.disconnect();
      reduce.removeEventListener("change", measure);
    };
  }, [products.length]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const visibility = new IntersectionObserver(
      ([entry]) => {
        setInView((current) => {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.08) return false;
          if (current) return true;
          return entry.intersectionRatio >= 0.28;
        });
      },
      { threshold: [0, 0.08, 0.28, 0.5] },
    );
    visibility.observe(viewport);
    return () => visibility.disconnect();
  }, []);

  useEffect(() => {
    if (!loop || !inView) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    offsetRef.current = viewport.scrollLeft;
    let frame = 0;
    let last = performance.now();
    let lock = false;
    // Scroll events from our own scrollLeft writes arrive just after the write.
    // A finger flick arrives later, and that is what should hold the drift.
    let lastWrite = 0;

    const wrap = (left: number, halfWidth: number) => {
      if (halfWidth <= 0) return left;
      if (left >= halfWidth) return left - halfWidth;
      if (left < 0) return left + halfWidth;
      return left;
    };

    const onScroll = () => {
      if (lock) return;
      const halfWidth = halfRef.current?.offsetWidth ?? 0;
      const left = viewport.scrollLeft;
      const fromUs = performance.now() - lastWrite < 80;
      if (halfWidth > 0 && left >= halfWidth) {
        lock = true;
        const wrapped = left - halfWidth;
        lastWrite = performance.now();
        viewport.scrollLeft = wrapped;
        offsetRef.current = wrapped;
        lock = false;
      }
      if (fromUs || halfWidth <= 0) return;
      offsetRef.current = viewport.scrollLeft;
      resumeAtRef.current = performance.now() + HOLD_AFTER_TOUCH_MS;
    };

    const tick = (now: number) => {
      const halfWidth = halfRef.current?.offsetWidth ?? 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const paused =
        aimingRef.current ||
        touchHoldRef.current ||
        focusedRef.current ||
        document.hidden ||
        now < resumeAtRef.current ||
        halfWidth <= 0;

      if (!paused) {
        const next = wrap(offsetRef.current + speedRef.current * dt, halfWidth);
        offsetRef.current = next;
        lastWrite = now;
        viewport.scrollLeft = next;
        viewport.dataset.moving = "true";
      } else {
        offsetRef.current = wrap(viewport.scrollLeft, halfWidth);
        viewport.dataset.moving = "false";
      }
      frame = requestAnimationFrame(tick);
    };

    viewport.addEventListener("scroll", onScroll, { passive: true });
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("scroll", onScroll);
      delete viewport.dataset.moving;
    };
  }, [loop, inView]);

  function rememberOffset() {
    const viewport = viewportRef.current;
    if (viewport) offsetRef.current = viewport.scrollLeft;
  }

  function releaseTouch() {
    touchHoldRef.current = false;
    resumeAtRef.current = Math.max(
      resumeAtRef.current,
      performance.now() + HOLD_AFTER_TOUCH_MS,
    );
    rememberOffset();
  }

  function page(dir: 1 | -1) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const halfWidth = halfRef.current?.offsetWidth ?? 0;
    const max = viewport.scrollWidth - viewport.clientWidth;
    let next = viewport.scrollLeft + dir * Math.round(viewport.clientWidth * 0.78);
    if (loop && halfWidth > 0) {
      next = ((next % halfWidth) + halfWidth) % halfWidth;
    } else {
      next = Math.max(0, Math.min(max, next));
    }
    viewport.scrollLeft = next;
    offsetRef.current = next;
  }

  if (products.length === 0) return null;

  return (
    <div
      className="group relative"
      onPointerDown={(event) => {
        if (event.pointerType === "mouse") aimingRef.current = true;
        else touchHoldRef.current = true;
        rememberOffset();
      }}
      onPointerMove={(event) => {
        // Ignore the zero-movement events browsers fire when the row slides
        // under a cursor that has not itself moved.
        if (event.pointerType !== "mouse") return;
        if (Math.hypot(event.movementX, event.movementY) < 1) return;
        aimingRef.current = true;
        rememberOffset();
      }}
      onPointerUp={(event) => {
        if (event.pointerType === "mouse") return;
        releaseTouch();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") {
          aimingRef.current = false;
          return;
        }
        releaseTouch();
      }}
      onPointerCancel={(event) => {
        if (event.pointerType === "mouse") {
          aimingRef.current = false;
          return;
        }
        releaseTouch();
      }}
      onWheel={(event) => {
        if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
        resumeAtRef.current = performance.now() + HOLD_AFTER_TOUCH_MS;
        rememberOffset();
      }}
      onFocus={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement) || !target.matches(":focus-visible")) return;
        focusedRef.current = true;
        rememberOffset();
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        focusedRef.current = false;
      }}
    >
      {overflows ? (
        <>
          <button
            type="button"
            aria-label="Scroll bestsellers left"
            onClick={() => page(-1)}
            className={arrowClass(loop, "left")}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Scroll bestsellers right"
            onClick={() => page(1)}
            className={arrowClass(loop, "right")}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      ) : null}
      <div
        ref={viewportRef}
        className="bestseller-marquee__viewport flex overflow-x-auto overscroll-x-contain pb-3 [overflow-anchor:none] [scroll-behavior:auto] [-ms-overflow-style:none] [scrollbar-width:none] md:pb-1 [&::-webkit-scrollbar]:hidden"
      >
        <ul ref={halfRef} className="m-0 flex shrink-0 list-none gap-4 p-0 pr-4">
          {products.map((product) => (
            <li key={product.id} className="bestseller-marquee__item">
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
        {loop ? (
          <ul className="m-0 flex shrink-0 list-none gap-4 p-0 pr-4" aria-hidden inert>
            {products.map((product) => (
              <li key={product.id} className="bestseller-marquee__item">
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function arrowClass(loop: boolean, side: "left" | "right") {
  return [
    "absolute top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-white bg-white/95 text-[var(--foreground)] shadow-md md:h-10 md:w-10 md:border-[var(--border)] md:bg-[var(--card)] md:transition md:hover:text-[var(--primary)]",
    side === "left" ? "left-1 md:-left-3" : "right-1 md:-right-3",
    // On a phone the row is moving and there is no hover, so the arrows would
    // only cover a case. A swipe is the manual control. They come back when
    // the row is still (reduced motion).
    loop
      ? "pointer-events-none opacity-0 max-md:hidden md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100"
      : "",
  ].join(" ");
}

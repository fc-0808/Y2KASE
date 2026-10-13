"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Horizontal product row. On a phone, edge arrows show that the row scrolls
 * and page it. From `md` the scrollbar stays hidden and the arrows go away.
 */
export function ScrollableProductRail({ children }: { children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  // Assume there is more to the right until the row is measured. Homepage
  // shelves skip layout until they near the viewport, so the first measure
  // can see a zero-width scroller.
  const [edges, setEdges] = useState({ left: false, right: true });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({
      left: el.scrollLeft > 8,
      right: max > 8 && el.scrollLeft < max - 8,
    });
  }, []);

  useEffect(() => {
    measure();
    const el = scroller.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const visibility = new IntersectionObserver(() => measure(), {
      root: null,
      threshold: 0,
    });
    visibility.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("scroll", measure);
      observer.disconnect();
      visibility.disconnect();
    };
  }, [measure]);

  function page(dir: 1 | -1) {
    const el = scroller.current;
    if (!el) return;
    const next = el.scrollLeft + dir * Math.round(el.clientWidth * 0.8);
    el.scrollTo({ left: next, behavior: "auto" });
    measure();
  }

  return (
    <div className="relative">
      {edges.left ? (
        <button
          type="button"
          onClick={() => page(-1)}
          aria-label="Scroll left"
          className="absolute left-1 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-white bg-white/95 text-[var(--foreground)] shadow-md md:hidden"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : null}
      {edges.right ? (
        <button
          type="button"
          onClick={() => page(1)}
          aria-label="Scroll right"
          className="absolute right-1 top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-white bg-white/95 text-[var(--foreground)] shadow-md md:hidden"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      ) : null}
      <div
        ref={scroller}
        onScroll={measure}
        className="-mx-4 flex items-stretch gap-4 overflow-x-auto px-4 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </div>
  );
}

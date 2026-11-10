"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Same face as the product-photo arrows: a 44px target and a small translucent disc. */
const RAIL_ARROW = cn(
  "group absolute top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center md:hidden",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
);
const RAIL_ARROW_FACE = cn(
  "grid size-7 place-items-center rounded-full",
  "bg-white/45 text-[var(--foreground)]/70 backdrop-blur-[2px]",
  "transition group-hover:bg-white/75 group-hover:text-[var(--foreground)]",
);

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
    const left = el.scrollLeft > 8;
    const right = max > 8 && el.scrollLeft < max - 8;
    setEdges((current) =>
      current.left === left && current.right === right ? current : { left, right },
    );
  }, []);

  useEffect(() => {
    measure();
  }, [measure, children]);

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
          className={cn(RAIL_ARROW, "left-1")}
        >
          <span className={RAIL_ARROW_FACE}>
            <ChevronLeft className="size-3.5" strokeWidth={2.4} />
          </span>
        </button>
      ) : null}
      {edges.right ? (
        <button
          type="button"
          onClick={() => page(1)}
          aria-label="Scroll right"
          className={cn(RAIL_ARROW, "right-1")}
        >
          <span className={RAIL_ARROW_FACE}>
            <ChevronRight className="size-3.5" strokeWidth={2.4} />
          </span>
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

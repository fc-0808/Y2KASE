"use client";

import { useEffect, useState, type RefObject } from "react";
import { stepCollapseChrome } from "./collapse-chrome";

function headerHeight(): number {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--storefront-header-h")
    .trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return 0;
  if (raw.endsWith("rem")) {
    return value * Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  }
  return value;
}

/**
 * Hide a sticky catalog bar after a downward scroll, and show it again on the
 * way up. `enabled` is false while the shopper is typing or a sheet is open,
 * which pins the bar in view.
 *
 * The bar only tucks away once it is stuck under the header. Hiding it while
 * it is still in normal flow would leave a blank gap above the products.
 *
 * The listener is passive and the React update fires only when the boolean
 * changes, so a long scroll does not re-render the catalog on every frame.
 */
export function useCollapseOnScrollDown(
  enabled: boolean,
  anchor: RefObject<HTMLElement | null>,
): boolean {
  const [collapsed, setCollapsed] = useState(false);
  const [tracked, setTracked] = useState(enabled);
  if (enabled !== tracked) {
    setTracked(enabled);
    if (!enabled) setCollapsed(false);
  }

  useEffect(() => {
    if (!enabled) return;

    let acc = 0;
    let hidden = false;
    let last = window.scrollY;
    let frame = 0;
    const limit = headerHeight();

    const apply = () => {
      frame = 0;
      const y = window.scrollY;
      const dy = y - last;
      last = y;
      if (!hidden) {
        const top = anchor.current?.getBoundingClientRect().top;
        if (top == null || top > limit + 1) {
          acc = 0;
          return;
        }
      }
      const next = stepCollapseChrome(hidden, acc, y, dy);
      acc = next.acc;
      if (next.hidden === hidden) return;
      hidden = next.hidden;
      setCollapsed(hidden);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(apply);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [anchor, enabled]);

  return collapsed;
}

"use client";

/**
 * Pinterest Tag — conversion tracking for Pinterest Shopping Ads.
 *
 * Required to:
 *  1. Run Pinterest Shopping Ads (Performance+ campaigns)
 *  2. Build retargeting audiences from site visitors
 *  3. Track and optimise for standard events (PageVisit, AddToCart, Checkout)
 *
 * Loaded on mount when `NEXT_PUBLIC_PINTEREST_TAG_ID` is set (no consent gate).
 *
 * Pinterest Tag standard events:
 *  - pagevisit  — every page view
 *  - viewcategory — collection / category pages
 *  - search     — search results
 *  - addtocart  — cart adds
 *  - checkout   — order completed
 *  - lead       — email capture / subscribe
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export const PINTEREST_TAG_ID = process.env.NEXT_PUBLIC_PINTEREST_TAG_ID;

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pintrk?: (...args: any[]) => void;
  }
}

function loadPinterestScript(tagId: string): void {
  if (typeof window === "undefined" || window.pintrk) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).pintrk = function (...args: unknown[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.pintrk as any).queue = (window.pintrk as any).queue || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.pintrk as any).queue.push(args);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window.pintrk as any).queue = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window.pintrk as any).version = "3.0";

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://s.pinimg.com/ct/core.js";
  document.head.appendChild(script);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pintrk = window.pintrk as unknown as (...args: any[]) => void;
  pintrk("load", tagId, { np: "nextjs" });
  pintrk("page");
}

/** Fire a Pinterest Tag event when the tag is loaded. */
export function trackPinEvent(
  event: string,
  data?: Record<string, unknown>,
): void {
  if (typeof window === "undefined" || !window.pintrk) return;
  window.pintrk("track", event, data ?? {});
}

export function PinterestTag() {
  const pathname = usePathname();

  useEffect(() => {
    if (!PINTEREST_TAG_ID) return;
    loadPinterestScript(PINTEREST_TAG_ID);
  }, []);

  useEffect(() => {
    if (!PINTEREST_TAG_ID || !window.pintrk) return;
    window.pintrk("page");
  }, [pathname]);

  return null;
}

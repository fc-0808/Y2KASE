"use client";

/**
 * Pinterest Tag — conversion tracking for Pinterest Shopping Ads.
 *
 * Required to:
 *  1. Run Pinterest Shopping Ads (Performance+ campaigns)
 *  2. Build retargeting audiences from site visitors
 *  3. Track and optimise for standard events (PageVisit, AddToCart, Checkout)
 *
 * Loaded after page load, during idle time, when
 * `NEXT_PUBLIC_PINTEREST_TAG_ID` is set (no consent gate).
 *
 * Pinterest Tag standard events:
 *  - pagevisit  — every page view
 *  - viewcategory — collection / category pages
 *  - search     — search results
 *  - addtocart  — cart adds
 *  - checkout   — order completed
 *  - lead       — email capture / subscribe
 */

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { scheduleAfterLoad } from "@/lib/analytics/idle";

export const PINTEREST_TAG_ID = process.env.NEXT_PUBLIC_PINTEREST_TAG_ID;
const pendingPinterestEvents: {
  event: string;
  data?: Record<string, unknown>;
}[] = [];

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pintrk?: (...args: any[]) => void;
    __y2kPinterestPage?: string;
    __y2kPinterestPendingPage?: string;
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
  window.__y2kPinterestPage =
    window.location.pathname + window.location.search;
  window.__y2kPinterestPendingPage = undefined;
  for (const pending of pendingPinterestEvents.splice(0)) {
    pintrk("track", pending.event, pending.data ?? {});
  }
}

/** Fire a Pinterest Tag event when the tag is loaded. */
export function trackPinEvent(
  event: string,
  data?: Record<string, unknown>,
): void {
  if (!PINTEREST_TAG_ID || typeof window === "undefined") return;
  if (!window.pintrk) {
    if (pendingPinterestEvents.length < 100) {
      pendingPinterestEvents.push({ event, data });
    }
    return;
  }
  window.pintrk("track", event, data ?? {});
}

function PinterestPageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const pageKey = query ? `${pathname}?${query}` : pathname;

  useEffect(() => {
    if (!PINTEREST_TAG_ID) return;
    if (!window.pintrk) {
      window.__y2kPinterestPendingPage = pageKey;
      return;
    }
    if (window.__y2kPinterestPage === pageKey) return;
    window.pintrk("page");
    window.__y2kPinterestPage = pageKey;
  }, [pageKey]);

  return null;
}

export function PinterestTag() {
  useEffect(() => {
    if (!PINTEREST_TAG_ID) return;
    return scheduleAfterLoad(() => loadPinterestScript(PINTEREST_TAG_ID));
  }, []);

  if (!PINTEREST_TAG_ID) return null;
  return (
    <Suspense fallback={null}>
      <PinterestPageviewTracker />
    </Suspense>
  );
}

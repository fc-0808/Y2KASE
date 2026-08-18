"use client";

/**
 * TikTok Pixel — client-side conversion tracking.
 *
 * Loaded after page load, during idle time, when `NEXT_PUBLIC_TIKTOK_PIXEL_ID`
 * is set (no consent gate).
 *
 * Standard events fired:
 *  - PageView  — every page navigation
 *  - ViewContent — product detail page (fired from ProductDetailClient)
 *  - AddToCart  — cart add (fired from ProductDetailClient)
 *  - InitiateCheckout — checkout start (fired from CartClient)
 *  - CompletePayment — order confirmed (fired from PurchaseTracking)
 */

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { scheduleAfterLoad } from "@/lib/analytics/idle";

export const TIKTOK_PIXEL_ID = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
const pendingTikTokEvents: {
  event: string;
  data?: Record<string, unknown>;
}[] = [];

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ttq?: any;
    TiktokAnalyticsObject?: string;
    __y2kTikTokPage?: string;
    __y2kTikTokPendingPage?: string;
  }
}

/** Inject TikTok Pixel script once. */
function loadTikTokScript(pixelId: string): void {
  if (typeof window === "undefined") return;
  if (window.ttq) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  w.TiktokAnalyticsObject = "ttq";
  const ttq = (w.ttq = w.ttq || []);
  ttq.methods = [
    "page","track","identify","instances","debug","on","off","once",
    "ready","alias","group","enableCookie","disableCookie","holdConsent",
    "revokeConsent","grantConsent",
  ];
  ttq.setAndDefer = function (t: unknown, e: string) {
    t = t || {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (t as any)[e] = function (...args: unknown[]) { (t as any).push([e, ...args]); };
  };
  ttq.methods.forEach((e: string) => ttq.setAndDefer(ttq, e));
  ttq.instance = function (t: string) {
    const i = ttq._i[t] || [];
    ttq.methods.forEach((e: string) => ttq.setAndDefer(i, e));
    return i;
  };
  ttq.load = function (e: string, n: Record<string, unknown>) {
    const o = "https://analytics.tiktok.com/i18n/pixel/events.js";
    ttq._i = ttq._i || {};
    ttq._i[e] = [];
    ttq._i[e]._u = o;
    ttq._t = ttq._t || {};
    ttq._t[e] = +new Date();
    ttq._o = ttq._o || {};
    ttq._o[e] = n || {};
    const s = document.createElement("script");
    s.type = "text/javascript";
    s.async = !0;
    s.src = o + "?sdkid=" + e + "&lib=ttq";
    const a = document.getElementsByTagName("script")[0];
    a.parentNode?.insertBefore(s, a);
  };

  ttq.load(pixelId);
  ttq.page();
  window.__y2kTikTokPage =
    window.location.pathname + window.location.search;
  window.__y2kTikTokPendingPage = undefined;
  for (const pending of pendingTikTokEvents.splice(0)) {
    ttq.track(pending.event, pending.data ?? {});
  }
}

/** Fire a TikTok standard event if the pixel is loaded. */
export function trackTtEvent(
  event: string,
  data?: Record<string, unknown>,
): void {
  if (!TIKTOK_PIXEL_ID || typeof window === "undefined") return;
  if (!window.ttq) {
    if (pendingTikTokEvents.length < 100) {
      pendingTikTokEvents.push({ event, data });
    }
    return;
  }
  window.ttq.track(event, data ?? {});
}

function TikTokPageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const pageKey = query ? `${pathname}?${query}` : pathname;

  useEffect(() => {
    if (!TIKTOK_PIXEL_ID) return;
    if (!window.ttq) {
      window.__y2kTikTokPendingPage = pageKey;
      return;
    }
    if (window.__y2kTikTokPage === pageKey) return;
    window.ttq.page();
    window.__y2kTikTokPage = pageKey;
  }, [pageKey]);

  return null;
}

export function TikTokPixel() {
  useEffect(() => {
    if (!TIKTOK_PIXEL_ID) return;
    return scheduleAfterLoad(() => loadTikTokScript(TIKTOK_PIXEL_ID));
  }, []);

  if (!TIKTOK_PIXEL_ID) return null;
  return (
    <Suspense fallback={null}>
      <TikTokPageviewTracker />
    </Suspense>
  );
}

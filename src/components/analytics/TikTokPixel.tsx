"use client";

/**
 * TikTok Pixel — client-side conversion tracking.
 *
 * Loaded on mount when `NEXT_PUBLIC_TIKTOK_PIXEL_ID` is set (no consent gate).
 *
 * Standard events fired:
 *  - PageView  — every page navigation
 *  - ViewContent — product detail page (fired from ProductDetailClient)
 *  - AddToCart  — cart add (fired from CartContext)
 *  - InitiateCheckout — checkout start (fired from CartClient)
 *  - Purchase  — order confirmed (fired from PurchaseTracking)
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export const TIKTOK_PIXEL_ID = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ttq?: any;
    TiktokAnalyticsObject?: string;
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
}

/** Fire a TikTok standard event if the pixel is loaded. */
export function trackTtEvent(
  event: string,
  data?: Record<string, unknown>,
): void {
  if (typeof window === "undefined" || !window.ttq) return;
  window.ttq.track(event, data ?? {});
}

export function TikTokPixel() {
  const pathname = usePathname();

  useEffect(() => {
    if (!TIKTOK_PIXEL_ID) return;
    loadTikTokScript(TIKTOK_PIXEL_ID);
  }, []);

  useEffect(() => {
    if (!TIKTOK_PIXEL_ID || !window.ttq) return;
    window.ttq.page();
  }, [pathname]);

  return null;
}

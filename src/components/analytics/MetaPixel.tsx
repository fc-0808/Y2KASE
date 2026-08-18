"use client";

/**
 * Meta (Facebook) Pixel — client-side event tracking.
 *
 * Initialized during browser idle time (no consent gate). Purchase events are
 * also sent server-side via Meta CAPI (see meta-capi.ts), which is more reliable
 * than the Pixel alone. Both channels send the same `event_id` for deduplication.
 */

import Script from "next/script";
import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

type PendingMetaEvent = {
  type: "track" | "trackCustom";
  name: string;
  data?: Record<string, unknown>;
  opts?: { eventID?: string };
};

const pendingMetaEvents: PendingMetaEvent[] = [];

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fbq?: (...args: any[]) => void;
    _fbq?: unknown;
    __y2kMetaPage?: string;
  }
}

/** Fire a Pixel event when fbq is available. */
export function trackFbEvent(
  type: "track" | "trackCustom",
  name: string,
  data?: Record<string, unknown>,
  opts?: { eventID?: string },
): void {
  if (!META_PIXEL_ID || typeof window === "undefined") return;
  if (typeof window.fbq !== "function") {
    if (pendingMetaEvents.length < 100) {
      pendingMetaEvents.push({ type, name, data, opts });
    }
    return;
  }
  if (opts?.eventID) {
    window.fbq(type, name, data ?? {}, { eventID: opts.eventID });
  } else {
    window.fbq(type, name, data ?? {});
  }
}

function flushMetaEvents(): void {
  if (typeof window.fbq !== "function") return;
  for (const event of pendingMetaEvents.splice(0)) {
    trackFbEvent(event.type, event.name, event.data, event.opts);
  }
}

function MetaPageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    const pageKey = query ? `${pathname}?${query}` : pathname;
    if (window.__y2kMetaPage === pageKey) return;
    if (typeof window.fbq !== "function") return;
    trackFbEvent("track", "PageView");
    window.__y2kMetaPage = pageKey;
  }, [pathname, searchParams]);

  return null;
}

export function MetaPixel() {
  if (!META_PIXEL_ID) return null;

  return (
    <>
      <Script
        id="meta-pixel-init"
        strategy="lazyOnload"
        onReady={flushMetaEvents}
      >
        {`
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){
          n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
          s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)
          }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init','${META_PIXEL_ID}');
          fbq('track','PageView');
          window.__y2kMetaPage = location.pathname + location.search;
        `}
      </Script>
      <Suspense fallback={null}>
        <MetaPageviewTracker />
      </Suspense>
    </>
  );
}

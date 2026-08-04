"use client";

/**
 * Meta (Facebook) Pixel — client-side event tracking.
 *
 * Initialized immediately (no consent gate). Purchase events are also sent
 * server-side via Meta CAPI (see meta-capi.ts), which is more reliable than the
 * Pixel alone (bypasses iOS 14 + ad blockers). Both channels send the same
 * `event_id` so Meta deduplicates automatically.
 */

import Script from "next/script";
import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fbq?: (...args: any[]) => void;
    _fbq?: unknown;
  }
}

/** Fire a Pixel event when fbq is available. */
export function trackFbEvent(
  type: "track" | "trackCustom",
  name: string,
  data?: Record<string, unknown>,
  opts?: { eventID?: string },
): void {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  if (opts?.eventID) {
    window.fbq(type, name, data ?? {}, { eventID: opts.eventID });
  } else {
    window.fbq(type, name, data ?? {});
  }
}

function MetaPageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    trackFbEvent("track", "PageView");
  }, [pathname, searchParams]);

  return null;
}

export function MetaPixel() {
  if (!META_PIXEL_ID) return null;

  return (
    <>
      <Script id="meta-pixel-init" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){
          n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
          s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)
          }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init','${META_PIXEL_ID}');
          fbq('track','PageView');
        `}
      </Script>
      <Suspense fallback={null}>
        <MetaPageviewTracker />
      </Suspense>
    </>
  );
}

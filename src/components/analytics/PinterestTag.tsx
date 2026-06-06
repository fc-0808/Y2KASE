"use client";

/**
 * Pinterest Tag — conversion tracking for Pinterest Shopping Ads.
 *
 * Required to:
 *  1. Run Pinterest Shopping Ads (Performance+ campaigns)
 *  2. Build retargeting audiences from site visitors
 *  3. Track and optimise for standard events (PageVisit, AddToCart, Checkout)
 *
 * Like TikTok, Pinterest has no native consent mode — the script is only
 * loaded after the visitor grants `ads` consent.
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
import { readConsent } from "@/lib/analytics/consent";

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

/** Fire a Pinterest Tag event — no-ops if not loaded or no consent. */
export function trackPinEvent(
  event: string,
  data?: Record<string, unknown>,
): void {
  if (typeof window === "undefined" || !window.pintrk) return;
  const consent = readConsent();
  if (!consent?.ads) return;
  window.pintrk("track", event, data ?? {});
}

export function PinterestTag() {
  const pathname = usePathname();

  useEffect(() => {
    if (!PINTEREST_TAG_ID) return;
    const consent = readConsent();
    if (consent?.ads) {
      loadPinterestScript(PINTEREST_TAG_ID);
      return;
    }
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ ads: boolean }>).detail;
      if (detail?.ads && PINTEREST_TAG_ID) {
        loadPinterestScript(PINTEREST_TAG_ID);
      }
    };
    window.addEventListener("y2k:consent-update", handler);
    return () => window.removeEventListener("y2k:consent-update", handler);
  }, []);

  useEffect(() => {
    if (!PINTEREST_TAG_ID) return;
    const consent = readConsent();
    if (!consent?.ads || !window.pintrk) return;
    window.pintrk("page");
  }, [pathname]);

  return null;
}

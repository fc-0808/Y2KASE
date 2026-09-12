"use client";

/**
 * VisitorTracker — fires a lightweight analytics beacon on every storefront
 * page view (initial load + client-side navigations). Sensitive data (IP and
 * geolocation) is derived server-side in /api/track; the client reports the
 * path/referrer plus positive-only browser-integrity signals. None of those
 * client signals is trusted as proof of humanity.
 *
 * Mounted once in the root layout. The console and internal routes are excluded
 * by `isTrackablePath`, which the server endpoint applies again — the beacon is
 * a hint, never the authority on what gets recorded.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isTrackablePath } from "@/lib/analytics/paths";
import {
  ANALYTICS_MARKER_HEADER,
  ANALYTICS_MARKER_VALUE,
  ANALYTICS_VISITOR_SEEDED_HEADER,
  ANALYTICS_VISITOR_SEEDED_VALUE,
  type AnalyticsBeaconPayload,
} from "@/lib/analytics/protocol";

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: { platform?: string };
};

export function VisitorTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || !isTrackablePath(pathname)) return;

    const nav = navigator as NavigatorWithUserAgentData;
    const beacon: AnalyticsBeaconPayload = {
      path: pathname,
      referrer: document.referrer || null,
      // Positive-only anti-automation signal. A custom bot can lie, so the
      // server never treats `false` as proof of humanity.
      webdriver: navigator.webdriver === true,
      platform: nav.userAgentData?.platform || navigator.platform || null,
    };
    const payload = JSON.stringify(beacon);
    const options: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [ANALYTICS_MARKER_HEADER]: ANALYTICS_MARKER_VALUE,
      },
      body: payload,
      credentials: "same-origin",
      cache: "no-store",
      // `keepalive` lets the request survive a navigation/unload.
      keepalive: true,
    };

    void (async () => {
      try {
        const response = await fetch("/api/track", options);
        if (
          response.headers.get(ANALYTICS_VISITOR_SEEDED_HEADER) ===
          ANALYTICS_VISITOR_SEEDED_VALUE
        ) {
          // The first request only plants signed HttpOnly cookies. Retrying
          // proves this browser accepted them and records the original view.
          await fetch("/api/track", options);
        }
      } catch {
        // Analytics is best-effort; never surface errors to the visitor.
      }
    })();
  }, [pathname]);

  return null;
}

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
import { useEffect, useRef } from "react";
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

export function VisitorTracker({
  pageRequest,
}: {
  /** Fetch metadata from the document request. The beacon cannot see these. */
  pageRequest?: {
    secFetchSite: string | null;
    secFetchMode: string | null;
    secFetchDest: string | null;
    secFetchUser: string | null;
  };
}) {
  const pathname = usePathname();
  // The layout reads one document. Later clicks in the same tab are not new
  // page loads, so they must not reuse that document's fetch metadata.
  const documentPath = useRef<string | null>(null);
  if (documentPath.current === null && pathname) {
    documentPath.current = pathname;
  }
  const pageRequestRef = useRef(pageRequest);
  pageRequestRef.current = pageRequest;

  useEffect(() => {
    if (!pathname || !isTrackablePath(pathname)) return;

    const nav = navigator as NavigatorWithUserAgentData;
    const documentFetch =
      pathname === documentPath.current ? pageRequestRef.current : undefined;
    const beacon: AnalyticsBeaconPayload = {
      path: pathname,
      referrer: document.referrer || null,
      // Campaign and click ids live on the landing URL. The referrer itself
      // is only an origin for Google, Instagram, and the other off-site apps.
      search: window.location.search
        ? window.location.search.slice(0, 512)
        : null,
      // Positive-only anti-automation signal. A custom bot can lie, so the
      // server never treats `false` as proof of humanity.
      webdriver: navigator.webdriver === true,
      platform: nav.userAgentData?.platform || navigator.platform || null,
      secFetchSite: documentFetch?.secFetchSite ?? null,
      secFetchMode: documentFetch?.secFetchMode ?? null,
      secFetchDest: documentFetch?.secFetchDest ?? null,
      secFetchUser: documentFetch?.secFetchUser ?? null,
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

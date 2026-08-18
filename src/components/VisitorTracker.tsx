"use client";

/**
 * VisitorTracker — fires a lightweight analytics beacon on every storefront
 * page view (initial load + client-side navigations). All sensitive data
 * (IP, geolocation, device) is derived server-side in /api/track; the client
 * only reports the path it landed on and the document referrer.
 *
 * Mounted once in the root layout. The console and internal routes are excluded
 * by `isTrackablePath`, which the server endpoint applies again — the beacon is
 * a hint, never the authority on what gets recorded.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isTrackablePath } from "@/lib/analytics/paths";

export function VisitorTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || !isTrackablePath(pathname)) return;

    const payload = JSON.stringify({
      path: pathname,
      referrer: document.referrer || null,
    });

    // `keepalive` lets the request survive a navigation/unload.
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Analytics is best-effort; never surface errors to the visitor.
    });
  }, [pathname]);

  return null;
}

"use client";

/**
 * Google Analytics 4 loader + SPA page-view tracker.
 *
 * Queues GA configuration and events immediately, then downloads gtag.js during
 * browser idle time so attribution never competes with LCP. We emit a page_view
 * on every App Router navigation ourselves; the default auto page view is off.
 *
 * Renders nothing (and loads no script) when NEXT_PUBLIC_GA_ID is unset, so
 * local/dev and preview environments stay clean.
 */

import Script from "next/script";
import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { GA_ID, gaPageview } from "@/lib/analytics/gtag";

function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    const qs = searchParams?.toString();
    gaPageview(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, searchParams]);

  return null;
}

export function GoogleAnalytics() {
  if (!GA_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="lazyOnload"
      />
      {/* useSearchParams must live under a Suspense boundary in the App Router. */}
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
    </>
  );
}

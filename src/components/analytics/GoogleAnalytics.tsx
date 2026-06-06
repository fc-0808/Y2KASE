"use client";

/**
 * Google Analytics 4 loader + SPA page-view tracker.
 *
 * Loads gtag.js once (after the page is interactive so it never blocks LCP) and
 * initializes the GA4 config with `send_page_view: false`. We then emit a
 * page_view on every App Router navigation ourselves, which is the correct way
 * to count views in a client-routed app — the default auto page_view only fires
 * on full document loads and would undercount soft navigations.
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
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}', { send_page_view: false });
        `}
      </Script>
      {/* useSearchParams must live under a Suspense boundary in the App Router. */}
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
    </>
  );
}

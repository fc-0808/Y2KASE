"use client";

/**
 * UTM Capture — captures attribution params from the landing URL.
 *
 * Runs once per navigation. If the URL contains UTM params or platform click
 * IDs (fbclid, ttclid, gclid), stores them in sessionStorage + a 30-day cookie
 * so checkout can attach them to the Stripe order as metadata.
 *
 * We only capture when params are present (i.e. a paid/referral landing), so
 * organic navigations within the site never overwrite the original attribution.
 */

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { extractUtmParams, saveUtmParams } from "@/lib/analytics/utm";

function UtmCaptureInner() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const search = searchParams?.toString();
    if (!search) return;
    const params = extractUtmParams(`?${search}`);
    if (params) saveUtmParams(params);
  }, [searchParams]);

  return null;
}

export function UtmCapture() {
  return (
    <Suspense fallback={null}>
      <UtmCaptureInner />
    </Suspense>
  );
}

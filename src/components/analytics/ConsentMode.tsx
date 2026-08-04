/**
 * Google Consent Mode v2 bootstrap.
 *
 * Emits a synchronous inline script so the gtag stub and granted-by-default
 * consent state exist *before* gtag.js (loaded afterInteractive) ever runs.
 * Without a cookie banner, defaults are granted so the first GA / Ads hit
 * carries full storage signals.
 *
 * A plain <script> (rather than next/script `beforeInteractive`) is used so it
 * runs at parse time in the document order and stays self-contained in the App
 * Router. The content is a trusted, machine-generated constant.
 */

import { CONSENT_DEFAULT_SCRIPT } from "@/lib/analytics/consent";

export function ConsentMode() {
  return <script dangerouslySetInnerHTML={{ __html: CONSENT_DEFAULT_SCRIPT }} />;
}

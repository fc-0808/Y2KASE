/**
 * Google Consent Mode v2 bootstrap.
 *
 * Emits a synchronous inline script so the gtag stub and denied-by-default
 * consent state exist *before* gtag.js (loaded afterInteractive) ever runs.
 * This ordering is what makes Consent Mode work: the first GA hit already knows
 * the visitor hasn't consented, and a returning visitor's stored choice is
 * re-applied immediately.
 *
 * A plain <script> (rather than next/script `beforeInteractive`) is used so it
 * runs at parse time in the document order and stays self-contained in the App
 * Router. The content is a trusted, machine-generated constant.
 */

import { CONSENT_DEFAULT_SCRIPT } from "@/lib/analytics/consent";

export function ConsentMode() {
  return <script dangerouslySetInnerHTML={{ __html: CONSENT_DEFAULT_SCRIPT }} />;
}

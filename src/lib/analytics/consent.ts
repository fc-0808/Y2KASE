/**
 * Google Consent Mode v2 — granted-by-default bootstrap.
 *
 * We do not show a cookie banner. Consent Mode still runs so gtag.js (loaded
 * afterInteractive) inherits an explicit granted state on the first hit, which
 * is the pattern Google recommends when analytics/ads tags are active without a
 * CMP. Keeping this stub also leaves a single place to re-introduce regional
 * consent later without rewriting every tag.
 *
 * The obsolete `y2k_consent` cookie (from the retired banner) is cleared so a
 * prior "reject" choice cannot leave tags in a denied state forever.
 */

/** Legacy cookie name — cleared on load; no longer written. */
const LEGACY_CONSENT_COOKIE = "y2k_consent";

/**
 * Inline script for the document-order bootstrap. Establishes the gtag stub and
 * granted Consent Mode defaults before any measurement tag loads.
 */
export const CONSENT_DEFAULT_SCRIPT = `
window.dataLayer = window.dataLayer || [];
window.gtag = function(){ window.dataLayer.push(arguments); };
gtag('consent', 'default', {
  ad_storage: 'granted',
  ad_user_data: 'granted',
  ad_personalization: 'granted',
  analytics_storage: 'granted'
});
try {
  document.cookie = '${LEGACY_CONSENT_COOKIE}=; path=/; max-age=0; samesite=lax';
} catch (e) {}
`;

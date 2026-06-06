/**
 * Cookie consent — Google Consent Mode v2 state management.
 *
 * We default every storage type to "denied" and only flip categories to
 * "granted" after the visitor opts in. Because GA4 runs in Consent Mode, denied
 * traffic still sends cookieless signals so Google can model conversions — we
 * stay compliant (GDPR / ePrivacy) without going analytically blind.
 *
 * The shared `CONSENT_COOKIE` + `CONSENT_DEFAULT_SCRIPT` are also read by the
 * `beforeInteractive` bootstrap so a returning visitor's choice is re-applied
 * before any Google tag loads.
 */

export const CONSENT_COOKIE = "y2k_consent";
export const CONSENT_MAX_AGE_DAYS = 180;

/** Custom event a "Cookie settings" link dispatches to re-open the banner. */
export const CONSENT_OPEN_EVENT = "y2k:open-consent";

export type ConsentState = {
  /** GA4 / first-party measurement. */
  analytics: boolean;
  /** Advertising cookies (Meta/TikTok/Google Ads) — reserved for future use. */
  ads: boolean;
};

export const CONSENT_GRANT_ALL: ConsentState = { analytics: true, ads: true };
export const CONSENT_DENY_ALL: ConsentState = { analytics: false, ads: false };

/** Read the stored consent choice (client only). Null when undecided. */
export function readConsent(): ConsentState | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`),
  );
  if (!match) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1])) as Partial<ConsentState>;
    return { analytics: Boolean(parsed.analytics), ads: Boolean(parsed.ads) };
  } catch {
    return null;
  }
}

/** Persist the choice and push it to gtag in one call. */
export function saveConsent(state: ConsentState): void {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(JSON.stringify(state));
  const maxAge = CONSENT_MAX_AGE_DAYS * 24 * 60 * 60;
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${value}; path=/; max-age=${maxAge}; samesite=lax${secure}`;
  applyConsent(state);
}

/** Translate our category booleans into a gtag consent update. */
export function applyConsent(state: ConsentState): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  const analytics = state.analytics ? "granted" : "denied";
  const ads = state.ads ? "granted" : "denied";
  window.gtag("consent", "update", {
    analytics_storage: analytics,
    ad_storage: ads,
    ad_user_data: ads,
    ad_personalization: ads,
  });
}

/**
 * Inline script for the `beforeInteractive` bootstrap. Establishes the gtag
 * stub, sets Consent Mode v2 defaults to denied, then re-applies any stored
 * choice — all before gtag.js loads. `wait_for_update` gives the update a brief
 * window so the very first hit carries the right consent signals.
 */
export const CONSENT_DEFAULT_SCRIPT = `
window.dataLayer = window.dataLayer || [];
window.gtag = function(){ window.dataLayer.push(arguments); };
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  wait_for_update: 500
});
gtag('set', 'url_passthrough', true);
gtag('set', 'ads_data_redaction', true);
try {
  var m = document.cookie.match(/(?:^|; )${CONSENT_COOKIE}=([^;]*)/);
  if (m) {
    var c = JSON.parse(decodeURIComponent(m[1]));
    var ads = c.ads ? 'granted' : 'denied';
    gtag('consent', 'update', {
      analytics_storage: c.analytics ? 'granted' : 'denied',
      ad_storage: ads,
      ad_user_data: ads,
      ad_personalization: ads
    });
  }
} catch (e) {}
`;

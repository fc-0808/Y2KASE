/**
 * Locale registry — ISOMORPHIC (safe on both the client and the server).
 *
 * The single source of truth for which languages the storefront speaks. Adding
 * one is a two-line job here plus a catalogue in `src/messages`; the parity test
 * then fails until every key is translated, which is what stops a half-finished
 * language reaching a shopper.
 *
 * WHY THESE SIX
 * They are exactly the languages of the markets Stripe is configured to ship to
 * (`SHIPPING_COUNTRIES` in /api/checkout: US CA GB AU HK SG JP DE FR NL NZ).
 * Translating a market we cannot deliver to is worse than leaving it in
 * English — it converts shoppers we then have to disappoint, and every extra
 * locale is a permanent tax on shipping copy. Expand this list when the
 * shipping list expands, not before.
 */

export const LOCALES = [
  "en", // US, CA, GB, AU, NZ, SG — also the fallback for everywhere else
  "ja", // JP
  "zh-Hant", // HK (Traditional Chinese)
  "de", // DE
  "fr", // FR, CA
  "nl", // NL
] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * The unprefixed default. `/products` stays English forever; `/ja/products`
 * serves Japanese. Keeping the default unprefixed means none of the store's
 * existing, already-indexed URLs move — no redirect debt, no lost rankings.
 */
export const DEFAULT_LOCALE: Locale = "en";

/** Endonyms — a language picker must name each language in that language. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ja: "日本語",
  "zh-Hant": "繁體中文",
  de: "Deutsch",
  fr: "Français",
  nl: "Nederlands",
};

/**
 * BCP-47 tags for `Intl.*` and the `hreflang` attribute. Kept separate from the
 * locale ids because the two are not always the same string: `hreflang` wants a
 * region for Traditional Chinese to be useful to search engines.
 */
export const LOCALE_HREFLANG: Record<Locale, string> = {
  en: "en",
  ja: "ja",
  "zh-Hant": "zh-Hant",
  de: "de",
  fr: "fr",
  nl: "nl",
};

/** Right-to-left languages. None yet — kept so adding `ar`/`he` is a data change. */
export const RTL_LOCALES: readonly Locale[] = [];

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function localeDirection(locale: Locale): "ltr" | "rtl" {
  return RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
}

/**
 * Country (ISO 3166-1 alpha-2) → the language most of that market reads.
 *
 * Used ONLY to *suggest* a language, never to force one. A visitor's IP says
 * where their device is, not what they read — an expat, a tourist or anyone on
 * a VPN would be silently given the wrong site. Countries absent from this map
 * fall through to the default locale.
 */
const COUNTRY_LOCALE: Record<string, Locale> = {
  JP: "ja",
  HK: "zh-Hant",
  TW: "zh-Hant",
  MO: "zh-Hant",
  DE: "de",
  AT: "de",
  CH: "de", // plurality German; a Swiss visitor reading French can still switch
  FR: "fr",
  BE: "fr", // plurality-French of our shipping-adjacent markets
  NL: "nl",
};

/** The language we'd guess for a country, or null when we have nothing better. */
export function localeForCountry(country: string | null | undefined): Locale | null {
  if (!country) return null;
  return COUNTRY_LOCALE[country.trim().toUpperCase()] ?? null;
}

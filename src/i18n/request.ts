/**
 * next-intl server configuration.
 *
 * Resolves the active locale for a request and loads that locale's catalogue.
 * Referenced by the `createNextIntlPlugin()` wrapper in next.config.ts.
 *
 * Until the routes are moved under a `[locale]` segment, `requestLocale` is
 * always undefined and every request resolves to English — which is exactly the
 * current behaviour, so wiring this up early is inert rather than risky.
 */

import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale } from "./locales";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;

  // Never trust the segment: an unknown or hand-edited `/xx/` prefix must serve
  // English rather than throw a module-not-found for a catalogue that
  // doesn't exist.
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

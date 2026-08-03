/**
 * Locale resolution — ISOMORPHIC and PURE (no headers, no cookies, no I/O).
 *
 * Every caller — the proxy, the layout, the language picker, the geo banner —
 * funnels through `resolveLocale` so there is exactly one definition of "which
 * language is this request in". Keeping it free of framework objects is what
 * makes the precedence rules directly testable.
 *
 * PRECEDENCE, strongest signal first:
 *
 *   1. The URL          — `/ja/products` must serve Japanese, full stop. If a
 *                         cookie could override the path the URL would be
 *                         lying, which breaks sharing, caching and hreflang.
 *   2. A saved choice   — the visitor picked a language before. An explicit
 *                         decision outranks anything we could infer.
 *   3. Accept-Language  — the browser's *declared* preference. This is the best
 *                         inference available and it is free.
 *   4. Geo-IP country   — last resort only. An IP says where a device is, not
 *                         what its owner reads: an expat, a tourist or anyone
 *                         on a VPN gets it wrong. Good enough to break a tie,
 *                         never good enough to override a stated preference.
 *   5. English.
 *
 * Deliberately NOT here: forcing a redirect based on geo. Googlebot crawls
 * almost entirely from US IPs, so IP-driven switching on a shared URL means the
 * translated pages never get indexed — the translation spend earns nothing.
 * Geo's only job is to populate a dismissible "view in 日本語?" suggestion.
 */

import {
  DEFAULT_LOCALE,
  LOCALES,
  isLocale,
  localeForCountry,
  type Locale,
} from "./locales";

/** Stores the visitor's explicit pick. Readable by JS — it is not a secret. */
export const LOCALE_COOKIE = "y2k_locale";

/** A year: a language preference should outlive a shopping session. */
export const LOCALE_COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;

export type LocaleSignals = {
  /** Locale segment already in the pathname, if any. */
  pathLocale?: string | null;
  /** Value of the saved-preference cookie. */
  cookie?: string | null;
  /** Raw `Accept-Language` request header. */
  acceptLanguage?: string | null;
  /** ISO 3166-1 alpha-2 country from the edge geo header. */
  country?: string | null;
};

export type LocaleDecision = {
  locale: Locale;
  /** Which signal won. The UI uses this to decide whether to offer a switch. */
  source: "path" | "cookie" | "header" | "geo" | "default";
};

/**
 * Match one BCP-47 tag from a browser against a locale we actually ship.
 *
 * Handles the two cases a naive equality check gets wrong: regional variants
 * (`de-AT` is still German) and Chinese, where the script matters far more than
 * the language because we only publish Traditional.
 */
function matchTag(tag: string): Locale | null {
  const lower = tag.trim().toLowerCase();
  if (!lower || lower === "*") return null;

  const exact = LOCALES.find((l) => l.toLowerCase() === lower);
  if (exact) return exact;

  // Traditional only. `zh-Hans` / `zh-CN` readers are better served by English
  // than by a script they may not read comfortably, so they fall through.
  if (lower === "zh" || lower.startsWith("zh-")) {
    return /hant|tw|hk|mo/.test(lower) ? "zh-Hant" : null;
  }

  const base = lower.split("-")[0];
  return LOCALES.find((l) => l.toLowerCase() === base) ?? null;
}

/**
 * Parse `Accept-Language` into tags ordered by descending quality.
 *
 * `en-US,en;q=0.9,ja;q=0.8` → `["en-US", "en", "ja"]`. Entries with `q=0` mean
 * "explicitly not this language" and are dropped rather than ranked last.
 */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];

  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.split(";");
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
      return {
        tag: (tag ?? "").trim(),
        q: Number.isFinite(quality) ? quality : 0,
      };
    })
    .filter((entry) => entry.tag !== "" && entry.q > 0)
    // Array#sort is stable, so equal-quality tags keep the browser's own order.
    .sort((a, b) => b.q - a.q)
    .map((entry) => entry.tag);
}

/** Case-insensitively map a URL segment to its canonical locale id. */
export function canonicalLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const lower = value.trim().toLowerCase();
  return LOCALES.find((l) => l.toLowerCase() === lower) ?? null;
}

/**
 * Split a locale prefix off a pathname.
 *
 * Accepts non-canonical casing (`/zh-hant/...`) so a hand-typed or mis-cased
 * link still resolves; the proxy is responsible for redirecting those to the
 * canonical spelling so only one URL is ever indexable.
 */
export function splitLocalePath(pathname: string): {
  locale: Locale | null;
  /** The pathname with any locale prefix removed. Always starts with "/". */
  rest: string;
} {
  const segments = pathname.split("/");
  const candidate = canonicalLocale(segments[1]);
  if (!candidate) return { locale: null, rest: pathname || "/" };

  const rest = segments.slice(2).join("/");
  return { locale: candidate, rest: rest ? `/${rest}` : "/" };
}

/**
 * Build the path for a given locale. The default locale stays unprefixed, which
 * is what keeps every already-indexed English URL exactly where it is.
 */
export function localizedPath(pathname: string, locale: Locale): string {
  const withSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const { rest } = splitLocalePath(withSlash);
  if (locale === DEFAULT_LOCALE) return rest;
  return rest === "/" ? `/${locale}` : `/${locale}${rest}`;
}

/** Apply the precedence rules above. */
export function resolveLocale(signals: LocaleSignals): LocaleDecision {
  const fromPath = canonicalLocale(signals.pathLocale);
  if (fromPath) return { locale: fromPath, source: "path" };

  if (isLocale(signals.cookie)) {
    return { locale: signals.cookie, source: "cookie" };
  }

  for (const tag of parseAcceptLanguage(signals.acceptLanguage)) {
    const matched = matchTag(tag);
    if (matched) return { locale: matched, source: "header" };
  }

  const fromGeo = localeForCountry(signals.country);
  if (fromGeo) return { locale: fromGeo, source: "geo" };

  return { locale: DEFAULT_LOCALE, source: "default" };
}

/**
 * The language to *offer* this visitor, or null to stay quiet.
 *
 * Returns a locale only when their country suggests something other than what
 * they are currently reading and they have never made a choice. Nagging someone
 * who already picked a language is how a banner becomes an ad.
 */
export function suggestedLocale(args: {
  current: Locale;
  country?: string | null;
  cookie?: string | null;
}): Locale | null {
  if (isLocale(args.cookie)) return null;

  const guess = localeForCountry(args.country);
  if (!guess || guess === args.current) return null;
  return guess;
}

/**
 * Google Preferred Sources — publisher embed.
 *
 * This is a per-reader personalization control, not a ranking plugin. Google's
 * documented effect: when a signed-in reader selects the site, that reader's
 * Top Stories / AI Overviews / AI Mode may badge our links as preferred.
 * It does not change rankings for anyone who has not selected us.
 *
 * Docs: https://developers.google.com/search/docs/appearance/preferred-sources
 *
 * Eligibility is domain-level and production-only. The deeplink always names
 * y2kase.com so a preview deployment cannot register localhost as a source.
 */

import { PRODUCTION_SITE_URL } from "@/lib/site";

export const PREFERRED_SOURCES_SCRIPT =
  "https://news.google.com/swg/js/v1/publisher.js";

/** Hostname Google's source-preferences tool expects. */
export const PREFERRED_SOURCES_HOST = new URL(PRODUCTION_SITE_URL).hostname;

/** Directs a reader to this domain in Google's source preferences UI. */
export function preferredSourcesDeeplink(
  host: string = PREFERRED_SOURCES_HOST,
): string {
  return `https://www.google.com/preferences/source?q=${encodeURIComponent(host)}`;
}

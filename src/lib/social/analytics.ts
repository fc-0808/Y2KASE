/**
 * Social Studio — Pinterest analytics refresh.
 *
 * Pulls per-pin metrics (impressions, saves, clicks, outbound clicks) from the
 * Pinterest API for every published creative and caches them on the row. Shared
 * by the admin "Refresh metrics" button and the daily analytics cron.
 *
 * Bounded + sequential to respect Pinterest's rate limits. Individual pin
 * failures are logged and skipped so one bad pin can't abort the whole refresh.
 */

import {
  getPublishedWithExternalId,
  updateCreativeMetrics,
} from "@/lib/social/creatives";
import { getPinAnalytics, isPinterestConfigured } from "@/lib/social/pinterest";

export type AnalyticsRefreshResult = {
  updated: number;
  failed: number;
  reason?: "not-configured";
};

export async function refreshAllPinMetrics(
  max = 100,
): Promise<AnalyticsRefreshResult> {
  if (!isPinterestConfigured()) {
    return { updated: 0, failed: 0, reason: "not-configured" };
  }

  const creatives = await getPublishedWithExternalId(max);
  let updated = 0;
  let failed = 0;

  for (const c of creatives) {
    if (!c.externalId) continue;
    try {
      const metrics = await getPinAnalytics(c.externalId);
      await updateCreativeMetrics(c.id, metrics);
      updated++;
    } catch (err) {
      console.error(`[social] analytics refresh failed for pin ${c.externalId}:`, err);
      failed++;
    }
  }

  return { updated, failed };
}

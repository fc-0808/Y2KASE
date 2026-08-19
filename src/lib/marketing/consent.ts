import "server-only";

import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { emailSubscribers } from "@/lib/db/schema";
import { clientIp } from "@/lib/rate-limit";

/**
 * Bump whenever the storefront's marketing-consent disclosure materially changes.
 * Ledger fields captured here are audit evidence written at signup, not a
 * sendability gate — campaigns, admin stats, and provider sync use
 * `isMarketingSendable` in `@/lib/marketing/audience` (`status === "active"`).
 */
export const MARKETING_CONSENT_VERSION = "2026-08-14-v1";

/**
 * Provider/customer opt-outs must never erase hard-suppression evidence.
 * `/api/subscribe` refuses to reactivate bounce/complaint/suppressed rows; if a
 * later webhook or one-click unsubscribe overwrote those reasons, the guard
 * would silently stop firing.
 */
export const HARD_SUPPRESSION_REASONS = [
  "bounce",
  "complaint",
  "suppressed",
] as const;

export type HardSuppressionReason = (typeof HARD_SUPPRESSION_REASONS)[number];

export function isHardSuppressionReason(
  value: string | null | undefined,
): value is HardSuppressionReason {
  return (
    value === "bounce" || value === "complaint" || value === "suppressed"
  );
}

/** SQL expression that keeps an existing hard-suppression reason intact. */
export function preserveHardSuppressionReason(next: string) {
  return sql`CASE WHEN ${emailSubscribers.unsubscribeReason} IN ('bounce', 'complaint', 'suppressed') THEN ${emailSubscribers.unsubscribeReason} ELSE ${next} END`;
}

export type MarketingConsentEvidence = {
  consentVersion: string;
  consentIpHash: string | null;
  consentUserAgent: string | null;
  consentLocale: string | null;
  consentCountry: string | null;
};

/**
 * Capture enough evidence to audit an opt-in without retaining a raw IP.
 * BETTER_AUTH_SECRET is already required in production; a dedicated override
 * permits independent key rotation if the list grows into a separate system.
 */
export function marketingConsentEvidence(
  request: NextRequest,
): MarketingConsentEvidence {
  const secret =
    process.env.CONSENT_HASH_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    "";
  const ip = clientIp(request);
  const consentIpHash =
    secret && ip !== "unknown"
      ? createHmac("sha256", secret)
          .update(`marketing-consent:${ip}`)
          .digest("hex")
      : null;
  const userAgent = request.headers.get("user-agent")?.trim().slice(0, 500) || null;
  const locale =
    request.headers
      .get("accept-language")
      ?.split(",")[0]
      ?.trim()
      .slice(0, 35) || null;
  const rawCountry = request.headers.get("x-vercel-ip-country")?.trim() ?? "";
  const country = /^[A-Za-z]{2}$/.test(rawCountry)
    ? rawCountry.toUpperCase()
    : null;

  return {
    consentVersion: MARKETING_CONSENT_VERSION,
    consentIpHash,
    consentUserAgent: userAgent,
    consentLocale: locale,
    consentCountry: country,
  };
}


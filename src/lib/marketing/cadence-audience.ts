/**
 * Server-side Club cadence: who may receive a broadcast *now*, and what the
 * operator calendar should show.
 *
 * Consent still lives on `email_subscribers.status`. This module only applies
 * frequency holdouts on top of that ledger. It must never mark someone
 * unsubscribed.
 */
import "server-only";

import { and, desc, eq, gte, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  emailSubscribers,
  marketingCampaigns,
  orders,
} from "@/lib/db/schema";
import { MARKETING_SENDABLE_STATUS } from "@/lib/marketing/audience";
import {
  CLUB_CADENCE_TIMEZONE,
  CLUB_SMART_SENDING_HOURS,
  CLUB_WELCOME_HOLDOUT_HOURS,
  buildClubWeekView,
  clubWeekBounds,
  evaluateBroadcastCadence,
  subscriberInSmartSendingHoldout,
  subscriberInWelcomeHoldout,
  type CadenceBroadcastRecord,
  type CadenceSnapshot,
  type CadenceVerdict,
} from "@/lib/marketing/cadence";
import { latestMarketingSendByEmail } from "@/lib/marketing/send-log";
import type { CampaignType } from "@/lib/marketing/types";

const PAID_ORDER_STATUSES = ["paid", "shipped", "delivered"] as const;

export type CampaignAudienceHoldouts = {
  emails: string[];
  active: number;
  welcomeHoldout: number;
  smartSendingHoldout: number;
  campaignEligible: number;
};

export async function getCadenceBroadcastsSince(
  since: Date,
): Promise<CadenceBroadcastRecord[]> {
  const launched = await db
    .select({
      id: marketingCampaigns.id,
      name: marketingCampaigns.name,
      campaignType: marketingCampaigns.campaignType,
      launchedAt: marketingCampaigns.launchedAt,
      launchStartedAt: marketingCampaigns.launchStartedAt,
      status: marketingCampaigns.status,
    })
    .from(marketingCampaigns)
    .where(
      or(
        and(
          inArray(marketingCampaigns.status, ["queued", "scheduled", "sent"]),
          isNotNull(marketingCampaigns.launchedAt),
          gte(marketingCampaigns.launchedAt, since),
        ),
        and(
          eq(marketingCampaigns.status, "preparing"),
          isNotNull(marketingCampaigns.launchStartedAt),
          gte(marketingCampaigns.launchStartedAt, since),
        ),
      ),
    )
    .orderBy(desc(marketingCampaigns.launchedAt));

  return launched.flatMap((row) => {
    const launchedAt = row.launchedAt ?? row.launchStartedAt;
    if (!launchedAt) return [];
    return [
      {
        id: row.id,
        name: row.name,
        campaignType: row.campaignType as CampaignType,
        launchedAt: launchedAt.toISOString(),
      },
    ];
  });
}

export async function evaluateLiveBroadcastCadence(input: {
  campaignType: CampaignType;
  campaignId?: string;
  now?: Date;
}): Promise<CadenceVerdict> {
  const now = input.now ?? new Date();
  const week = clubWeekBounds(now);
  const broadcasts = await getCadenceBroadcastsSince(week.start);
  return evaluateBroadcastCadence({
    now,
    campaignType: input.campaignType,
    broadcasts,
    ignoreCampaignId: input.campaignId,
  });
}

export async function getCampaignAudienceHoldouts(
  now: Date = new Date(),
): Promise<CampaignAudienceHoldouts> {
  const subscribers = await db
    .select({
      email: emailSubscribers.email,
      subscribedAt: emailSubscribers.subscribedAt,
    })
    .from(emailSubscribers)
    .where(eq(emailSubscribers.status, MARKETING_SENDABLE_STATUS));

  const emails = subscribers.map((row) => row.email.trim().toLowerCase());
  const lookbackHours = Math.max(
    CLUB_SMART_SENDING_HOURS,
    CLUB_WELCOME_HOLDOUT_HOURS,
  );
  const since = new Date(now.getTime() - lookbackHours * 3_600_000);
  const latest = await latestMarketingSendByEmail(emails, since);

  let welcomeHoldout = 0;
  let smartSendingHoldout = 0;
  const eligible: string[] = [];

  for (const row of subscribers) {
    const email = row.email.trim().toLowerCase();
    if (subscriberInWelcomeHoldout(row.subscribedAt, now)) {
      welcomeHoldout += 1;
      continue;
    }
    const lastSent = latest.get(email) ?? null;
    if (subscriberInSmartSendingHoldout(lastSent, now)) {
      smartSendingHoldout += 1;
      continue;
    }
    eligible.push(email);
  }

  eligible.sort();
  return {
    emails: eligible,
    active: subscribers.length,
    welcomeHoldout,
    smartSendingHoldout,
    campaignEligible: eligible.length,
  };
}

/**
 * Intersect Resend-reconciled sendable addresses with Club holdouts.
 * Provider opt-outs already dropped out of `providerEligible`; we never add
 * anyone the provider would not send to.
 */
export function intersectCampaignAudience(
  providerEligible: string[],
  holdouts: CampaignAudienceHoldouts,
): string[] {
  const allowed = new Set(holdouts.emails);
  return providerEligible
    .map((email) => email.trim().toLowerCase())
    .filter((email) => allowed.has(email))
    .sort();
}

export async function getCadenceSnapshot(
  now: Date = new Date(),
): Promise<CadenceSnapshot> {
  const week = clubWeekBounds(now, CLUB_CADENCE_TIMEZONE);
  const [broadcasts, holdouts] = await Promise.all([
    getCadenceBroadcastsSince(week.start),
    getCampaignAudienceHoldouts(now),
  ]);
  const weekView = buildClubWeekView({
    now,
    broadcasts,
    timeZone: CLUB_CADENCE_TIMEZONE,
  });
  return {
    timezone: CLUB_CADENCE_TIMEZONE,
    weekStartIso: weekView.week.start.toISOString(),
    weekEndIso: weekView.week.end.toISOString(),
    weekLabel: weekView.week.label,
    broadcastsThisWeek: broadcasts,
    slots: weekView.slots,
    nextSlot: weekView.nextSlot,
    holdouts: {
      active: holdouts.active,
      welcomeHoldout: holdouts.welcomeHoldout,
      smartSendingHoldout: holdouts.smartSendingHoldout,
      campaignEligible: holdouts.campaignEligible,
    },
  };
}

export async function subscriberHasPaidOrder(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const row = await db.query.orders.findFirst({
    where: and(
      sql`lower(${orders.email}) = ${normalized}`,
      inArray(orders.status, [...PAID_ORDER_STATUSES]),
    ),
    columns: { id: true },
  });
  return Boolean(row);
}

export function cadenceBlockMessage(verdict: CadenceVerdict): string | null {
  return verdict.blockers[0]?.message ?? null;
}

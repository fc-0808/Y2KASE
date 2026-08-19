import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailSubscribers, marketingCampaigns } from "@/lib/db/schema";
import { MARKETING_SENDABLE_STATUS } from "./audience";
import { SUPPORT_EMAIL } from "@/lib/support/constants";
import { marketingPostalAddress } from "./compliance";
import { MARKETING_TEMPLATE_VERSION } from "./template";
import {
  LAUNCH_CLAIM_STALE_MS,
  isRecoverablePreparingCampaign,
} from "./campaign-status";
import type {
  MarketingCampaignStatus,
  MarketingCampaignView,
  MarketingDraft,
} from "./types";

export {
  LAUNCH_CLAIM_STALE_MS,
  isRecoverablePreparingCampaign,
} from "./campaign-status";

const CAMPAIGN_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EDITABLE_STATUSES = ["draft", "failed"] as const;
const STATUS_VALUES = new Set<MarketingCampaignStatus>([
  "draft",
  "preparing",
  "queued",
  "scheduled",
  "sent",
  "cancelled",
  "failed",
]);

export function isCampaignId(value: string): boolean {
  return CAMPAIGN_ID.test(value);
}

/** Stable hash used to prove that the exact reviewed content received a test. */
export function marketingContentHash(draft: MarketingDraft): string {
  const ordered = [
    draft.name,
    draft.campaignType,
    draft.subject,
    draft.previewText,
    draft.eyebrow,
    draft.heading,
    draft.body,
    draft.ctaLabel,
    draft.ctaUrl,
    draft.heroImageUrl,
    draft.heroImageAlt,
    draft.promoCode,
    MARKETING_TEMPLATE_VERSION,
    new Date().getUTCFullYear(),
    marketingPostalAddress() ?? "",
    process.env.EMAIL_FROM_MARKETING?.trim() ||
      process.env.EMAIL_FROM?.trim() ||
      "Y2KASE <orders@send.y2kase.com>",
    SUPPORT_EMAIL,
  ];
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}

function status(value: string): MarketingCampaignStatus {
  return STATUS_VALUES.has(value as MarketingCampaignStatus)
    ? (value as MarketingCampaignStatus)
    : "failed";
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function toMarketingCampaignView(
  row: typeof marketingCampaigns.$inferSelect,
): MarketingCampaignView {
  return {
    id: row.id,
    name: row.name,
    campaignType: row.campaignType as MarketingDraft["campaignType"],
    subject: row.subject,
    previewText: row.previewText,
    eyebrow: row.eyebrow,
    heading: row.heading,
    body: row.body,
    ctaLabel: row.ctaLabel,
    ctaUrl: row.ctaUrl,
    heroImageUrl: row.heroImageUrl ?? "",
    heroImageAlt: row.heroImageAlt ?? "",
    promoCode: row.promoCode ?? "",
    status: status(row.status),
    contentHash: row.contentHash,
    testedContentHash: row.testedContentHash,
    lastTestSentAt: iso(row.lastTestSentAt),
    preparedRecipientCount: row.preparedRecipientCount,
    preparedAt: iso(row.preparedAt),
    launchedAt: iso(row.launchedAt),
    resendBroadcastId: row.resendBroadcastId,
    recipientCount: row.recipientCount,
    scheduledAt: iso(row.scheduledAt),
    sentAt: iso(row.sentAt),
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getMarketingCampaigns(
  limit = 30,
): Promise<MarketingCampaignView[]> {
  const rows = await db.query.marketingCampaigns.findMany({
    orderBy: desc(marketingCampaigns.createdAt),
    limit: Math.max(1, Math.min(limit, 100)),
  });
  return rows.map(toMarketingCampaignView);
}

export async function getLocallyEligibleSubscriberEmails(): Promise<string[]> {
  const rows = await db
    .select({ email: emailSubscribers.email })
    .from(emailSubscribers)
    .where(eq(emailSubscribers.status, MARKETING_SENDABLE_STATUS))
    .orderBy(asc(emailSubscribers.email));
  return rows.map((row) => row.email.trim().toLowerCase());
}

export async function getMarketingCampaign(id: string) {
  if (!isCampaignId(id)) return null;
  return (
    (await db.query.marketingCampaigns.findFirst({
      where: eq(marketingCampaigns.id, id),
    })) ?? null
  );
}

type SaveDraftResult =
  | { ok: true; campaign: MarketingCampaignView }
  | { ok: false; error: string };

export async function saveMarketingCampaignRecord(input: {
  id: string;
  draft: MarketingDraft;
  createdBy: string;
}): Promise<SaveDraftResult> {
  if (!isCampaignId(input.id)) {
    return { ok: false, error: "Invalid campaign id." };
  }

  const now = new Date();
  const contentHash = marketingContentHash(input.draft);
  const existing = await getMarketingCampaign(input.id);

  if (
    existing?.status === "failed" &&
    existing.resendBroadcastId &&
    existing.contentHash !== contentHash
  ) {
    return {
      ok: false,
      error:
        "This failed campaign already has a provider broadcast. Duplicate it before changing content.",
    };
  }

  const staleBefore = new Date(Date.now() - LAUNCH_CLAIM_STALE_MS);
  const recoverablePreparing =
    existing != null && isRecoverablePreparingCampaign(existing);

  if (
    existing &&
    !EDITABLE_STATUSES.includes(
      existing.status as (typeof EDITABLE_STATUSES)[number],
    ) &&
    !recoverablePreparing
  ) {
    return {
      ok: false,
      error:
        existing.status === "preparing"
          ? "This campaign is still being prepared. Wait a few minutes for the stale claim to expire, then try again."
          : "A queued, scheduled, sent, cancelled, or preparing campaign can no longer be edited. Duplicate it instead.",
    };
  }

  if (!existing) {
    const [created] = await db
      .insert(marketingCampaigns)
      .values({
        id: input.id,
        createdBy: input.createdBy,
        ...input.draft,
        heroImageUrl: input.draft.heroImageUrl || null,
        heroImageAlt: input.draft.heroImageAlt || null,
        promoCode: input.draft.promoCode || null,
        contentHash,
        status: "draft",
        updatedAt: now,
      })
      .returning();
    return { ok: true, campaign: toMarketingCampaignView(created) };
  }

  const [updated] = await db
    .update(marketingCampaigns)
    .set({
      ...input.draft,
      heroImageUrl: input.draft.heroImageUrl || null,
      heroImageAlt: input.draft.heroImageAlt || null,
      promoCode: input.draft.promoCode || null,
      contentHash,
      testedContentHash:
        existing.contentHash === contentHash ? existing.testedContentHash : null,
      reviewedContentHash:
        existing.contentHash === contentHash
          ? existing.reviewedContentHash
          : null,
      reviewedBy:
        existing.contentHash === contentHash ? existing.reviewedBy : null,
      reviewedAt:
        existing.contentHash === contentHash ? existing.reviewedAt : null,
      preparedAudienceHash:
        existing.contentHash === contentHash
          ? existing.preparedAudienceHash
          : null,
      preparedRecipientCount:
        existing.contentHash === contentHash
          ? existing.preparedRecipientCount
          : null,
      preparedAt:
        existing.contentHash === contentHash ? existing.preparedAt : null,
      launchAttemptId: null,
      launchStartedAt: null,
      status: "draft",
      lastError: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(marketingCampaigns.id, input.id),
        eq(marketingCampaigns.contentHash, existing.contentHash),
        recoverablePreparing
          ? and(
              eq(marketingCampaigns.status, "preparing"),
              lt(marketingCampaigns.updatedAt, staleBefore),
            )
          : inArray(marketingCampaigns.status, [...EDITABLE_STATUSES]),
      ),
    )
    .returning();

  if (!updated) {
    return {
      ok: false,
      error:
        "This draft changed in another session. Refresh before saving again.",
    };
  }
  return { ok: true, campaign: toMarketingCampaignView(updated) };
}

export async function markCampaignTested(
  id: string,
  contentHash: string,
): Promise<boolean> {
  const rows = await db
    .update(marketingCampaigns)
    .set({
      testedContentHash: contentHash,
      lastTestSentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketingCampaigns.id, id),
        eq(marketingCampaigns.contentHash, contentHash),
        eq(marketingCampaigns.status, "draft"),
      ),
    )
    .returning({ id: marketingCampaigns.id });
  return rows.length === 1;
}

export async function markCampaignAudiencePrepared(input: {
  id: string;
  contentHash: string;
  audienceHash: string;
  recipientCount: number;
  reviewedBy: string;
}): Promise<boolean> {
  const rows = await db
    .update(marketingCampaigns)
    .set({
      preparedAudienceHash: input.audienceHash,
      preparedRecipientCount: input.recipientCount,
      preparedAt: new Date(),
      reviewedContentHash: input.contentHash,
      reviewedBy: input.reviewedBy,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketingCampaigns.id, input.id),
        inArray(marketingCampaigns.status, ["draft", "preparing", "failed"]),
        eq(marketingCampaigns.contentHash, input.contentHash),
        eq(marketingCampaigns.testedContentHash, input.contentHash),
      ),
    )
    .returning({ id: marketingCampaigns.id });
  return rows.length === 1;
}

type ClaimResult =
  | { ok: true; campaign: typeof marketingCampaigns.$inferSelect }
  | { ok: false; error: string };

/**
 * Atomically claim a launch. A stale claim can be recovered after five minutes;
 * fresh concurrent requests cannot both pass the status predicate.
 */
export async function claimCampaignLaunch(
  id: string,
  contentHash: string,
  audienceHash: string,
  recipientCount: number,
  launchedBy: string,
): Promise<ClaimResult> {
  const existing = await getMarketingCampaign(id);
  if (!existing) return { ok: false, error: "Campaign not found." };
  if (existing.contentHash !== contentHash) {
    return { ok: false, error: "Save and test the latest campaign content first." };
  }
  if (existing.testedContentHash !== contentHash) {
    return {
      ok: false,
      error: "Send a test of this exact version before launching it.",
    };
  }
  if (
    existing.reviewedContentHash !== contentHash ||
    !existing.reviewedBy ||
    !existing.reviewedAt
  ) {
    return {
      ok: false,
      error: "Record final human review before launching this version.",
    };
  }
  if (
    existing.preparedAudienceHash !== audienceHash ||
    existing.preparedRecipientCount !== recipientCount
  ) {
    return { ok: false, error: "Review the current audience before launching." };
  }
  if (existing.status === "queued" || existing.status === "scheduled") {
    return { ok: false, error: "This campaign has already been launched." };
  }
  if (existing.status === "sent") {
    return { ok: false, error: "This campaign has already been sent." };
  }

  const staleBefore = new Date(Date.now() - LAUNCH_CLAIM_STALE_MS);
  const launchAttemptId = randomUUID();
  const sameReviewedVersion = and(
    eq(marketingCampaigns.id, id),
    eq(marketingCampaigns.contentHash, contentHash),
    eq(marketingCampaigns.testedContentHash, contentHash),
    eq(marketingCampaigns.reviewedContentHash, contentHash),
    isNotNull(marketingCampaigns.reviewedBy),
    isNotNull(marketingCampaigns.reviewedAt),
    eq(marketingCampaigns.preparedAudienceHash, audienceHash),
    eq(marketingCampaigns.preparedRecipientCount, recipientCount),
  );
  const eligible =
    existing.status === "preparing"
      ? and(
          sameReviewedVersion,
          eq(marketingCampaigns.status, "preparing"),
          lt(marketingCampaigns.updatedAt, staleBefore),
        )
      : and(
          sameReviewedVersion,
          inArray(marketingCampaigns.status, [...EDITABLE_STATUSES]),
        );

  const [claimed] = await db
    .update(marketingCampaigns)
    .set({
      status: "preparing",
      launchedBy,
      launchAttemptId,
      launchStartedAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eligible)
    .returning();

  return claimed
    ? { ok: true, campaign: claimed }
    : {
        ok: false,
        error: "This campaign is already being prepared in another session.",
      };
}

export async function recordCampaignProviderDraft(input: {
  id: string;
  broadcastId: string;
  segmentId: string;
  topicId: string;
  recipientCount: number;
  launchAttemptId: string;
}) {
  const rows = await db
    .update(marketingCampaigns)
    .set({
      resendBroadcastId: input.broadcastId,
      resendSegmentId: input.segmentId,
      resendTopicId: input.topicId,
      recipientCount: input.recipientCount,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketingCampaigns.id, input.id),
        eq(marketingCampaigns.status, "preparing"),
        eq(marketingCampaigns.launchAttemptId, input.launchAttemptId),
      ),
    )
    .returning({ id: marketingCampaigns.id });
  if (rows.length !== 1) {
    throw new Error("Campaign launch claim was lost before provider draft save.");
  }
}

export async function recordCampaignLaunched(input: {
  id: string;
  recipientCount: number;
  scheduledAt: Date | null;
  launchAttemptId: string;
}) {
  const rows = await db
    .update(marketingCampaigns)
    .set({
      status: input.scheduledAt ? "scheduled" : "queued",
      recipientCount: input.recipientCount,
      scheduledAt: input.scheduledAt,
      launchedAt: new Date(),
      // "queued" is not proof of delivery. The webhook/status reconciliation
      // records sentAt only after Resend reports the broadcast as sent.
      sentAt: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketingCampaigns.id, input.id),
        eq(marketingCampaigns.launchAttemptId, input.launchAttemptId),
        inArray(marketingCampaigns.status, ["preparing", "failed"]),
      ),
    )
    .returning({ id: marketingCampaigns.id });
  if (rows.length === 1) return;

  // A provider webhook can report "sent" between the API call and this write.
  // Never move that terminal state backwards to queued/scheduled.
  const current = await getMarketingCampaign(input.id);
  if (
    current?.status === "sent" ||
    current?.status === "queued" ||
    current?.status === "scheduled"
  ) {
    return;
  }
  throw new Error("Campaign launch state could not be persisted.");
}

export async function recordCampaignFailure(
  id: string,
  message: string,
  launchAttemptId?: string,
) {
  const ownership = launchAttemptId
    ? eq(marketingCampaigns.launchAttemptId, launchAttemptId)
    : undefined;
  await db
    .update(marketingCampaigns)
    .set({
      status: "failed",
      lastError: message.slice(0, 1_000),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketingCampaigns.id, id),
        ownership,
        inArray(marketingCampaigns.status, ["draft", "preparing", "failed"]),
      ),
    );
}

export async function markCampaignSentByBroadcast(broadcastId: string) {
  await db
    .update(marketingCampaigns)
    .set({
      status: "sent",
      sentAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketingCampaigns.resendBroadcastId, broadcastId),
        inArray(marketingCampaigns.status, [
          "preparing",
          "queued",
          "scheduled",
          "failed",
        ]),
      ),
    );
}


"use server";

import { createHash, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getProductForAdmin } from "@/lib/products";
import {
  generateMarketingCopy,
  type MarketingTone,
} from "@/lib/marketing/ai";
import {
  claimCampaignLaunch,
  getLocallyEligibleSubscriberEmails,
  getMarketingCampaign,
  markCampaignAudiencePrepared,
  markCampaignSentByBroadcast,
  markCampaignTested,
  marketingContentHash,
  recordCampaignFailure,
  recordCampaignLaunched,
  recordCampaignProviderDraft,
  saveMarketingCampaignRecord,
} from "@/lib/marketing/campaigns";
import {
  createMarketingBroadcastDraft,
  createMarketingAudienceSnapshot,
  getMarketingBroadcast,
  refreshMarketingCampaignStatuses,
  removeMarketingBroadcastDraft,
  removeMarketingSegment,
  sendMarketingBroadcast,
  sendMarketingTest,
  syncMarketingAudience,
  updateMarketingBroadcastDraft,
} from "@/lib/marketing/resend";
import {
  renderMarketingEmail,
  validateMarketingDraft,
} from "@/lib/marketing/template";
import {
  configuredMarketingSegmentId,
  configuredMarketingTopicId,
  isMarketingSendEnabled,
  isMarketingSenderConfigured,
  marketingMaxRecipients,
  marketingPostalAddress,
} from "@/lib/marketing/compliance";
import {
  CAMPAIGN_TYPES,
  MARKETING_SCHEDULING_ENABLED,
  MARKETING_LIMITS,
  type CampaignType,
  type MarketingCampaignView,
  type MarketingDraft,
  type MarketingProductOption,
} from "@/lib/marketing/types";

type BasicResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export type GenerateCampaignResult =
  | {
      ok: true;
      message: string;
      draft: MarketingDraft;
      subjectAlternatives: string[];
    }
  | { ok: false; message: string };

export type SaveCampaignResult =
  | { ok: true; message: string; campaign: MarketingCampaignView }
  | { ok: false; message: string };

export type PrepareAudienceResult =
  | {
      ok: true;
      message: string;
      recipientCount: number;
      synchronizedCount: number;
      audienceFingerprint: string;
    }
  | { ok: false; message: string };

export type LaunchCampaignResult =
  | {
      ok: true;
      message: string;
      recipientCount: number;
      broadcastId: string;
      scheduled: boolean;
    }
  | {
      ok: false;
      message: string;
      audienceChanged?: boolean;
      recipientCount?: number;
      audienceFingerprint?: string;
    };

async function admin() {
  return requireAdmin(await headers());
}

function bounded(
  value: unknown,
  label: string,
  max: number,
): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof value !== "string") {
    return { ok: false, message: `${label} is invalid.` };
  }
  const normalized = value.trim();
  if (normalized.length > max) {
    return { ok: false, message: `${label} must be ${max} characters or fewer.` };
  }
  return { ok: true, value: normalized };
}

async function trustedProduct(
  productId: number | null,
): Promise<MarketingProductOption | null> {
  if (productId === null) return null;
  if (!Number.isInteger(productId) || productId <= 0) {
    throw new Error("Choose a valid product.");
  }
  const product = await getProductForAdmin(productId);
  if (!product || product.status !== "active") {
    throw new Error("The selected product is not currently live.");
  }
  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    price: product.price,
    currency: product.currency,
    imageUrl: product.images[0]?.url ?? null,
  };
}

function deliveryConfigurationError(): string | null {
  if (!process.env.RESEND_API_KEY) {
    return "RESEND_API_KEY is not configured.";
  }
  if (!isMarketingSenderConfigured()) {
    return "Set EMAIL_FROM_MARKETING so campaigns never use the transactional sender.";
  }
  if (!marketingPostalAddress()) {
    return "Add MARKETING_POSTAL_ADDRESS before testing or sending marketing email.";
  }
  return null;
}

function productionConfigurationError(): string | null {
  const deliveryError = deliveryConfigurationError();
  if (deliveryError) return deliveryError;
  if (!configuredMarketingSegmentId() || !configuredMarketingTopicId()) {
    return "Configure dedicated Resend segment and topic IDs before production sending.";
  }
  if (!process.env.RESEND_WEBHOOK_SECRET?.trim()) {
    return "Configure the signed Resend webhook before production sending.";
  }
  if (!isMarketingSendEnabled()) {
    return "Marketing sending is disabled. Set MARKETING_SEND_ENABLED=true only when launch setup is complete.";
  }
  return null;
}

function audienceFingerprint(emails: string[]): string {
  return createHash("sha256")
    .update(JSON.stringify([...emails].sort()))
    .digest("hex");
}

function testUnsubscribeUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://y2kase.com";
  // Deliberately non-functional in a test message: testing the design must not
  // unsubscribe the administrator from a real audience.
  return `${base}/unsubscribe?preview=1`;
}

export async function generateCampaignDraft(input: {
  campaignType: string;
  brief: string;
  offer: string;
  tone: string;
  promoCode: string;
  productId: number | null;
  currentDraft: unknown;
}): Promise<GenerateCampaignResult> {
  if (!(await admin())) return { ok: false, message: "Not authorized." };
  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, message: "OPENAI_API_KEY is not configured." };
  }

  const campaignType = CAMPAIGN_TYPES.includes(input.campaignType as CampaignType)
    ? (input.campaignType as CampaignType)
    : null;
  const tones = new Set<MarketingTone>([
    "playful",
    "polished",
    "warm",
    "energetic",
  ]);
  const tone = tones.has(input.tone as MarketingTone)
    ? (input.tone as MarketingTone)
    : null;
  const brief = bounded(input.brief, "Brief", MARKETING_LIMITS.brief);
  const offer = bounded(input.offer, "Offer", 500);
  const promoCode = bounded(
    input.promoCode,
    "Promo code",
    MARKETING_LIMITS.promoCode,
  );
  const current = validateMarketingDraft(input.currentDraft);

  if (!campaignType) return { ok: false, message: "Choose a valid campaign type." };
  if (!tone) return { ok: false, message: "Choose a valid tone." };
  if (!brief.ok) return brief;
  if (!offer.ok) return offer;
  if (!promoCode.ok) return promoCode;
  if (!current.ok) return { ok: false, message: current.errors[0] };

  try {
    const product = await trustedProduct(input.productId);
    const generated = await generateMarketingCopy({
      campaignType,
      brief: brief.value,
      offer: offer.value,
      tone,
      promoCode: promoCode.value,
      product,
      currentDraft: current.value,
    });
    return {
      ok: true,
      message: "AI draft generated. Review every field before testing.",
      ...generated,
    };
  } catch (error) {
    console.error("[campaigns] AI generation failed:", error);
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "AI generation failed. Try again.",
    };
  }
}

export async function saveCampaignDraft(
  id: string,
  input: unknown,
): Promise<SaveCampaignResult> {
  const session = await admin();
  if (!session) return { ok: false, message: "Not authorized." };
  const validated = validateMarketingDraft(input);
  if (!validated.ok) return { ok: false, message: validated.errors[0] };

  try {
    const saved = await saveMarketingCampaignRecord({
      id,
      draft: validated.value,
      createdBy: session.user.id,
    });
    if (!saved.ok) return { ok: false, message: saved.error };
    revalidatePath("/admin/campaigns");
    return {
      ok: true,
      message: "Draft saved.",
      campaign: saved.campaign,
    };
  } catch (error) {
    console.error("[campaigns] save failed:", error);
    return { ok: false, message: "The draft could not be saved." };
  }
}

export async function sendCampaignTest(
  id: string,
  input: unknown,
): Promise<SaveCampaignResult> {
  const session = await admin();
  if (!session) return { ok: false, message: "Not authorized." };
  const configError = deliveryConfigurationError();
  if (configError) return { ok: false, message: configError };
  const validated = validateMarketingDraft(input);
  if (!validated.ok) return { ok: false, message: validated.errors[0] };

  try {
    const saved = await saveMarketingCampaignRecord({
      id,
      draft: validated.value,
      createdBy: session.user.id,
    });
    if (!saved.ok) return { ok: false, message: saved.error };

    const contentHash = marketingContentHash(validated.value);
    const rendered = renderMarketingEmail(validated.value, {
      postalAddress: marketingPostalAddress()!,
      unsubscribeUrl: testUnsubscribeUrl(),
      campaignId: id,
    });
    await sendMarketingTest({
      to: session.user.email,
      campaignId: id,
      contentHash,
      testAttemptId: randomUUID(),
      subject: validated.value.subject,
      html: rendered.html,
      text: rendered.text,
    });
    const marked = await markCampaignTested(id, contentHash);
    if (!marked) {
      return {
        ok: false,
        message:
          "The draft changed while the test was sending. Review and test it again.",
      };
    }
    const campaign = await getMarketingCampaign(id);
    if (!campaign) return { ok: false, message: "Campaign not found after testing." };
    revalidatePath("/admin/campaigns");
    return {
      ok: true,
      message: `Test sent to ${session.user.email}.`,
      campaign: {
        ...saved.campaign,
        testedContentHash: contentHash,
        lastTestSentAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("[campaigns] test send failed:", error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The test email failed.",
    };
  }
}

export async function prepareCampaignAudience(
  id: string,
  input: unknown,
  reviewAcknowledged: boolean,
): Promise<PrepareAudienceResult> {
  const session = await admin();
  if (!session) return { ok: false, message: "Not authorized." };
  const configError = productionConfigurationError();
  if (configError) return { ok: false, message: configError };
  if (reviewAcknowledged !== true) {
    return {
      ok: false,
      message: "Complete and acknowledge the final human review first.",
    };
  }
  const validated = validateMarketingDraft(input);
  if (!validated.ok) return { ok: false, message: validated.errors[0] };

  try {
    const saved = await saveMarketingCampaignRecord({
      id,
      draft: validated.value,
      createdBy: session.user.id,
    });
    if (!saved.ok) return { ok: false, message: saved.error };
    if (saved.campaign.testedContentHash !== saved.campaign.contentHash) {
      return {
        ok: false,
        message: "Send a test of this exact version before reviewing the audience.",
      };
    }

    const audience = await syncMarketingAudience();
    revalidatePath("/admin/subscribers");
    revalidatePath("/admin/campaigns");
    if (audience.recipientCount === 0) {
      return { ok: false, message: "There are no eligible active subscribers." };
    }
    const maxRecipients = marketingMaxRecipients();
    if (audience.recipientCount > maxRecipients) {
      return {
        ok: false,
        message: `Audience has ${audience.recipientCount} recipients; the configured safety ceiling is ${maxRecipients}.`,
      };
    }
    const fingerprint = audienceFingerprint(audience.eligibleEmails);
    const prepared = await markCampaignAudiencePrepared({
      id,
      contentHash: saved.campaign.contentHash,
      audienceHash: fingerprint,
      recipientCount: audience.recipientCount,
      reviewedBy: session.user.id,
    });
    if (!prepared) {
      return {
        ok: false,
        message:
          "The campaign changed during audience review. Save, test, and review it again.",
      };
    }
    return {
      ok: true,
      message: `${audience.recipientCount} eligible subscriber${
        audience.recipientCount === 1 ? "" : "s"
      } reconciled with Resend.`,
      recipientCount: audience.recipientCount,
      synchronizedCount: audience.synchronizedCount,
      audienceFingerprint: fingerprint,
    };
  } catch (error) {
    console.error("[campaigns] audience preparation failed:", error);
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Audience reconciliation failed.",
    };
  }
}

function launchDate(value: string | null): Date | null {
  if (!value) return null;
  if (!MARKETING_SCHEDULING_ENABLED) {
    throw new Error(
      "Scheduled campaigns are disabled until durable suppression retries are available.",
    );
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Choose a valid send time.");
  const delay = date.getTime() - Date.now();
  if (delay < 5 * 60_000) {
    throw new Error("Scheduled sends must be at least five minutes in the future.");
  }
  if (delay > 30 * 24 * 60 * 60_000) {
    throw new Error("Schedule the campaign within the next 30 days.");
  }
  return date;
}

export async function launchCampaign(input: {
  id: string;
  draft: unknown;
  expectedRecipientCount: number;
  expectedAudienceFingerprint: string;
  scheduledAt: string | null;
  confirmation: string;
}): Promise<LaunchCampaignResult> {
  const session = await admin();
  if (!session) return { ok: false, message: "Not authorized." };
  const configError = productionConfigurationError();
  if (configError) return { ok: false, message: configError };
  const validated = validateMarketingDraft(input.draft);
  if (!validated.ok) return { ok: false, message: validated.errors[0] };
  if (
    !Number.isInteger(input.expectedRecipientCount) ||
    input.expectedRecipientCount <= 0 ||
    input.expectedRecipientCount > 1_000_000
  ) {
    return { ok: false, message: "Review the audience again before launching." };
  }
  if (input.expectedRecipientCount > marketingMaxRecipients()) {
    return {
      ok: false,
      message: `Recipient count exceeds the configured safety ceiling of ${marketingMaxRecipients()}.`,
    };
  }
  if (!/^[a-f0-9]{64}$/.test(input.expectedAudienceFingerprint)) {
    return { ok: false, message: "Review the audience again before launching." };
  }

  let scheduledAt: Date | null;
  try {
    scheduledAt = launchDate(input.scheduledAt);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Invalid schedule.",
    };
  }
  const command = `${scheduledAt ? "SCHEDULE" : "SEND"} ${
    input.expectedRecipientCount
  }`;
  if (input.confirmation.trim() !== command) {
    return { ok: false, message: `Type ${command} exactly to confirm.` };
  }

  let activeLaunchAttemptId: string | null = null;
  try {
    const saved = await saveMarketingCampaignRecord({
      id: input.id,
      draft: validated.value,
      createdBy: session.user.id,
    });
    if (!saved.ok) return { ok: false, message: saved.error };

    const contentHash = marketingContentHash(validated.value);
    const claimed = await claimCampaignLaunch(
      input.id,
      contentHash,
      input.expectedAudienceFingerprint,
      input.expectedRecipientCount,
      session.user.id,
    );
    if (!claimed.ok) return { ok: false, message: claimed.error };
    activeLaunchAttemptId = claimed.campaign.launchAttemptId;
    if (!activeLaunchAttemptId) {
      throw new Error("Campaign launch attempt ownership was not persisted.");
    }

    const audience = await syncMarketingAudience();
    const currentFingerprint = audienceFingerprint(audience.eligibleEmails);
    if (
      audience.recipientCount !== input.expectedRecipientCount ||
      currentFingerprint !== input.expectedAudienceFingerprint
    ) {
      const message =
        audience.recipientCount !== input.expectedRecipientCount
          ? `Audience changed from ${input.expectedRecipientCount} to ${audience.recipientCount}. Review and confirm the new count.`
          : `Audience membership changed while the count remained ${audience.recipientCount}. Review and confirm it again.`;
      await markCampaignAudiencePrepared({
        id: input.id,
        contentHash,
        audienceHash: currentFingerprint,
        recipientCount: audience.recipientCount,
        reviewedBy: session.user.id,
      });
      await recordCampaignFailure(input.id, message, activeLaunchAttemptId);
      revalidatePath("/admin/subscribers");
      revalidatePath("/admin/campaigns");
      return {
        ok: false,
        message,
        audienceChanged: true,
        recipientCount: audience.recipientCount,
        audienceFingerprint: currentFingerprint,
      };
    }
    if (audience.recipientCount === 0) {
      await recordCampaignFailure(
        input.id,
        "No eligible active subscribers.",
        activeLaunchAttemptId,
      );
      return { ok: false, message: "There are no eligible active subscribers." };
    }

    const rendered = renderMarketingEmail(validated.value, {
      postalAddress: marketingPostalAddress()!,
      campaignId: input.id,
    });
    let broadcastId = claimed.campaign.resendBroadcastId;
    let deliverySegmentId = claimed.campaign.resendSegmentId;
    const previousSnapshotId = claimed.campaign.resendSegmentId;
    let snapshotCreated = false;
    let broadcastCreated = false;
    let provider:
      | Awaited<ReturnType<typeof getMarketingBroadcast>>
      | undefined;
    let providerStatus: string | null = null;
    if (broadcastId) {
      provider = await getMarketingBroadcast(broadcastId);
      providerStatus = provider ? String(provider.status) : null;
      if (providerStatus === "sent") {
        await markCampaignSentByBroadcast(broadcastId);
        return {
          ok: true,
          message: "This campaign had already been sent; no duplicate was created.",
          recipientCount: audience.recipientCount,
          broadcastId,
          scheduled: false,
        };
      }
      if (providerStatus === "queued" || providerStatus === "scheduled") {
        await recordCampaignLaunched({
          id: input.id,
          recipientCount: audience.recipientCount,
          scheduledAt: provider?.scheduled_at
            ? new Date(provider.scheduled_at)
            : null,
          launchAttemptId: activeLaunchAttemptId,
        });
        return {
          ok: true,
          message:
            "This campaign was already queued with Resend; no duplicate was created.",
          recipientCount: audience.recipientCount,
          broadcastId,
          scheduled: Boolean(provider?.scheduled_at),
        };
      }
      if (!provider) {
        broadcastId = null;
        deliverySegmentId = null;
      } else if (providerStatus !== "draft") {
        throw new Error(
          `Provider broadcast is in unsupported status "${providerStatus}". Refresh before retrying.`,
        );
      }
    }

    // A retryable provider draft may have been prepared against an older
    // audience. Re-snapshot before updating it; queued/sent broadcasts returned
    // above are immutable and are never duplicated.
    if (!deliverySegmentId || providerStatus === "draft") {
      deliverySegmentId = await createMarketingAudienceSnapshot({
        campaignId: input.id,
        campaignName: validated.value.name,
        eligibleEmails: audience.eligibleEmails,
      });
      snapshotCreated = true;
    }
    if (broadcastId && providerStatus === "draft") {
      await updateMarketingBroadcastDraft(broadcastId, {
        draft: validated.value,
        segmentId: deliverySegmentId,
        topicId: audience.topicId,
        html: rendered.html,
        text: rendered.text,
      });
    }
    if (!broadcastId) {
      broadcastId = await createMarketingBroadcastDraft({
        draft: validated.value,
        segmentId: deliverySegmentId,
        topicId: audience.topicId,
        html: rendered.html,
        text: rendered.text,
      });
      broadcastCreated = true;
    }
    try {
      await recordCampaignProviderDraft({
        id: input.id,
        broadcastId,
        segmentId: deliverySegmentId,
        topicId: audience.topicId,
        recipientCount: audience.recipientCount,
        launchAttemptId: activeLaunchAttemptId,
      });
    } catch (error) {
      // A new provider draft is still unsent and unreferenced locally, so clean
      // it up rather than leaving an orphan after a database write failure.
      if (broadcastCreated) {
        const removed = await removeMarketingBroadcastDraft(broadcastId);
        if (removed && snapshotCreated) {
          await removeMarketingSegment(deliverySegmentId);
        }
      }
      throw error;
    }
    if (
      previousSnapshotId &&
      previousSnapshotId !== deliverySegmentId
    ) {
      await removeMarketingSegment(previousSnapshotId);
    }

    const finalLocalAudience = await getLocallyEligibleSubscriberEmails();
    if (audienceFingerprint(finalLocalAudience) !== currentFingerprint) {
      const message =
        "Local consent changed during launch preparation. Review the audience again; nothing was sent.";
      await recordCampaignFailure(input.id, message, activeLaunchAttemptId);
      return {
        ok: false,
        message,
        audienceChanged: true,
        recipientCount: finalLocalAudience.length,
      };
    }

    await sendMarketingBroadcast(
      broadcastId,
      scheduledAt ? scheduledAt.toISOString() : null,
    );
    await recordCampaignLaunched({
      id: input.id,
      recipientCount: audience.recipientCount,
      scheduledAt,
      launchAttemptId: activeLaunchAttemptId,
    });
    revalidatePath("/admin/campaigns");
    return {
      ok: true,
      message: scheduledAt
        ? `Campaign scheduled for ${scheduledAt.toLocaleString("en-US", {
            timeZone: "UTC",
            dateStyle: "medium",
            timeStyle: "short",
          })} UTC.`
        : `Campaign queued for ${audience.recipientCount} subscriber${
            audience.recipientCount === 1 ? "" : "s"
          }.`,
      recipientCount: audience.recipientCount,
      broadcastId,
      scheduled: Boolean(scheduledAt),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Campaign launch failed.";
    console.error("[campaigns] launch failed:", error);
    try {
      await recordCampaignFailure(
        input.id,
        message,
        activeLaunchAttemptId ?? undefined,
      );
    } catch (recordError) {
      console.error("[campaigns] could not record launch failure:", recordError);
    }
    revalidatePath("/admin/campaigns");
    return { ok: false, message };
  }
}

export async function refreshCampaignStatuses(): Promise<BasicResult> {
  if (!(await admin())) return { ok: false, message: "Not authorized." };
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, message: "RESEND_API_KEY is not configured." };
  }
  try {
    const updated = await refreshMarketingCampaignStatuses();
    revalidatePath("/admin/campaigns");
    return {
      ok: true,
      message: updated
        ? `Updated ${updated} campaign status${updated === 1 ? "" : "es"}.`
        : "Campaign statuses are already current.",
    };
  } catch (error) {
    console.error("[campaigns] status refresh failed:", error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Status refresh failed.",
    };
  }
}


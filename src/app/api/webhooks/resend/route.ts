/**
 * POST /api/webhooks/resend
 *
 * Keeps provider-side opt-outs and broadcast state in the local consent/audit
 * ledger. The signature is verified against the raw request body before any
 * event is trusted.
 */
import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { WebhookEventPayload } from "resend";
import { db } from "@/lib/db";
import {
  emailSubscribers,
  marketingCampaigns,
  resendWebhookEvents,
} from "@/lib/db/schema";
import { getResend } from "@/lib/email";
import {
  markCampaignSentByBroadcast,
} from "@/lib/marketing/campaigns";
import {
  getMarketingBroadcast,
  reconcileResendContact,
} from "@/lib/marketing/resend";

export const runtime = "nodejs";

function permanentBounce(type: string): boolean {
  const normalized = type.toLowerCase();
  return normalized.includes("permanent") || normalized.includes("hard");
}

async function suppressLocalRecipients(
  recipients: string[],
  reason: "bounce" | "complaint" | "suppressed",
  occurredAt: Date,
) {
  const emails = Array.from(
    new Set(recipients.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  );
  if (emails.length === 0) return;
  await db
    .update(emailSubscribers)
    .set({
      status: "unsubscribed",
      unsubscribedAt: occurredAt,
      unsubscribeReason: reason,
    })
    .where(
      and(
        inArray(emailSubscribers.email, emails),
        or(
          isNull(emailSubscribers.resubscribedAt),
          lt(emailSubscribers.resubscribedAt, occurredAt),
        ),
        or(
          isNull(emailSubscribers.consentRecordedAt),
          lt(emailSubscribers.consentRecordedAt, occurredAt),
        ),
      ),
    );
}

async function reconcileBroadcastCompletion(broadcastId: string) {
  const campaign = await db.query.marketingCampaigns.findFirst({
    where: eq(marketingCampaigns.resendBroadcastId, broadcastId),
    columns: { status: true },
  });
  if (!campaign || campaign.status === "sent" || campaign.status === "cancelled") {
    return;
  }
  const broadcast = await getMarketingBroadcast(broadcastId);
  if (broadcast?.status === "sent") {
    await markCampaignSentByBroadcast(broadcastId);
  }
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  const resend = getResend();
  if (!webhookSecret || !resend) {
    console.error("[resend-webhook] webhook is not configured.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const payload = await request.text();
  let event: WebhookEventPayload;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret,
    });
  } catch (error) {
    console.error("[resend-webhook] signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }
  const duplicate = await db.query.resendWebhookEvents.findFirst({
    where: eq(resendWebhookEvents.id, id),
    columns: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    const parsedEventAt = new Date(event.created_at);
    const eventAt = Number.isNaN(parsedEventAt.getTime())
      ? new Date()
      : parsedEventAt;
    switch (event.type) {
      case "contact.created":
      case "contact.updated":
        await reconcileResendContact(event.data.email, eventAt);
        break;

      case "email.complained":
        await suppressLocalRecipients(event.data.to, "complaint", eventAt);
        break;

      case "email.suppressed":
        await suppressLocalRecipients(event.data.to, "suppressed", eventAt);
        break;

      case "email.bounced":
        if (permanentBounce(event.data.bounce.type)) {
          await suppressLocalRecipients(event.data.to, "bounce", eventAt);
        }
        break;

      case "email.delivered":
        if (event.data.broadcast_id) {
          await reconcileBroadcastCompletion(event.data.broadcast_id);
        }
        break;

      default:
        break;
    }
    await db
      .insert(resendWebhookEvents)
      .values({
        id,
        eventType: event.type,
        receivedAt: eventAt,
      })
      .onConflictDoNothing({ target: resendWebhookEvents.id });
  } catch (error) {
    // A 500 asks Resend to retry a transient database/provider failure.
    console.error(`[resend-webhook] handler failed for ${event.type}:`, error);
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}


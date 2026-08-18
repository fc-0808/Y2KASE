import "server-only";

import { eq, inArray } from "drizzle-orm";
import type { Broadcast, Contact, Resend, Segment, Topic } from "resend";
import { db } from "@/lib/db";
import { emailSubscribers, marketingCampaigns } from "@/lib/db/schema";
import { SITE_URL } from "@/lib/site";
import {
  EMAIL_REPLY_TO,
  getResend,
  senderFor,
} from "@/lib/email";
import {
  configuredMarketingSegmentId,
  configuredMarketingTopicId,
  isMarketingSenderConfigured,
  marketingPostalAddress,
} from "./compliance";
import type { MarketingDraft } from "./types";

const DEFAULT_SEGMENT_NAME = "Y2KASE Subscribers";
const DEFAULT_TOPIC_NAME = "Y2KASE News & Offers";
const MIN_REQUEST_INTERVAL_MS = 550;

let requestQueue: Promise<void> = Promise.resolve();
let nextRequestAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resend's API is intentionally conservative about request rate. Serialize
 * contact reconciliation calls per instance and retry only transient failures.
 */
function resendApi<T>(
  call: () => Promise<T>,
  options: { retry?: boolean } = {},
): Promise<T> {
  const retry = options.retry !== false;
  const run = requestQueue.then(async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const wait = Math.max(0, nextRequestAt - Date.now());
      if (wait) await sleep(wait);
      nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;

      try {
        const response = await call();
        const error = (
          response as { error?: { name?: string; statusCode?: number } }
        ).error;
        const transient =
          error?.name === "rate_limit_exceeded" ||
          error?.statusCode === 429 ||
          (typeof error?.statusCode === "number" && error.statusCode >= 500);
        if (!transient || !retry || attempt === 3) return response;
      } catch (error) {
        if (!retry || attempt === 3) throw error;
      }
      await sleep(750 * 2 ** attempt);
    }
    throw new Error("Unreachable Resend retry state.");
  });
  requestQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function client(): Resend {
  const resend = getResend();
  if (!resend) throw new Error("Email delivery is not configured.");
  return resend;
}

function marketingSender(): string {
  if (!isMarketingSenderConfigured()) {
    throw new Error(
      "EMAIL_FROM_MARKETING is required for marketing delivery.",
    );
  }
  if (!marketingPostalAddress()) {
    throw new Error(
      "MARKETING_POSTAL_ADDRESS is required for marketing delivery.",
    );
  }
  return senderFor("marketing");
}

function providerError(operation: string, message: string): Error {
  return new Error(`${operation} failed: ${message}`);
}

function splitName(name: string | null): {
  firstName: string | undefined;
  lastName: string | undefined;
} {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: undefined, lastName: undefined };
  return {
    firstName: parts[0].slice(0, 100),
    lastName: parts.slice(1).join(" ").slice(0, 100) || undefined,
  };
}

async function allSegments(resend: Resend): Promise<Segment[]> {
  const output: Segment[] = [];
  let after: string | undefined;
  for (let page = 0; page < 100; page++) {
    const response = await resendApi(() =>
      resend.segments.list({
        limit: 100,
        ...(after ? { after } : {}),
      }),
    );
    if (response.error) {
      throw providerError("Listing marketing segments", response.error.message);
    }
    output.push(...response.data.data);
    if (!response.data.has_more || response.data.data.length === 0) break;
    if (page === 99) {
      throw new Error("Marketing segment pagination exceeded the safety limit.");
    }
    after = response.data.data.at(-1)?.id;
  }
  return output;
}

async function allContacts(
  resend: Resend,
  segmentId?: string,
): Promise<Contact[]> {
  const output: Contact[] = [];
  let after: string | undefined;
  for (let page = 0; page < 100; page++) {
    const response = await resendApi(() =>
      resend.contacts.list({
        limit: 100,
        ...(segmentId ? { segmentId } : {}),
        ...(after ? { after } : {}),
      }),
    );
    if (response.error) {
      throw providerError("Listing marketing contacts", response.error.message);
    }
    output.push(...response.data.data);
    if (!response.data.has_more || response.data.data.length === 0) break;
    if (page === 99) {
      throw new Error("Marketing contact pagination exceeded the safety limit.");
    }
    after = response.data.data.at(-1)?.id;
  }
  return output;
}

async function resolveSegment(
  resend: Resend,
): Promise<{ segment: Segment; owned: boolean }> {
  const configuredId = configuredMarketingSegmentId();
  if (configuredId) {
    const response = await resendApi(() => resend.segments.get(configuredId));
    if (response.error) {
      throw providerError("Loading the configured marketing segment", response.error.message);
    }
    return { segment: response.data, owned: false };
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "RESEND_MARKETING_SEGMENT_ID is required in production. Provision a dedicated segment explicitly.",
    );
  }

  const name =
    process.env.RESEND_MARKETING_SEGMENT_NAME?.trim() || DEFAULT_SEGMENT_NAME;
  const segments = await allSegments(resend);
  const existing = segments.find(
    (segment) => segment.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (existing) return { segment: existing, owned: true };

  const response = await resendApi(
    () => resend.segments.create({ name }),
    { retry: false },
  );
  if (response.error) {
    // Another serverless instance may have created the named resource between
    // our list and create calls. Resolve that race before surfacing an error.
    const raced = (await allSegments(resend)).find(
      (segment) => segment.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (raced) return { segment: raced, owned: true };
    throw providerError("Creating the marketing segment", response.error.message);
  }
  return {
    segment: {
      id: response.data.id,
      name: response.data.name,
      created_at: new Date().toISOString(),
    },
    owned: true,
  };
}

async function resolveTopic(resend: Resend): Promise<Topic> {
  function requireFailClosed(topic: Topic): Topic {
    if (topic.default_subscription !== "opt_out") {
      throw new Error(
        `Marketing topic "${topic.name}" must default to opt_out before it can be used.`,
      );
    }
    return topic;
  }

  const configuredId = configuredMarketingTopicId();
  if (configuredId) {
    const response = await resendApi(() => resend.topics.get(configuredId));
    if (response.error) {
      throw providerError("Loading the configured marketing topic", response.error.message);
    }
    return requireFailClosed(response.data);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "RESEND_MARKETING_TOPIC_ID is required in production. Provision an opt-out-default topic explicitly.",
    );
  }

  const name =
    process.env.RESEND_MARKETING_TOPIC_NAME?.trim() || DEFAULT_TOPIC_NAME;
  const listed = await resendApi(() => resend.topics.list());
  if (listed.error) {
    throw providerError("Listing marketing topics", listed.error.message);
  }
  const existing = listed.data.data.find(
    (topic) => topic.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (existing) return requireFailClosed(existing);

  const response = await resendApi(() =>
    resend.topics.create({
      name,
      description: "Product drops, subscriber offers, restocks and Y2KASE news.",
      defaultSubscription: "opt_out",
    }),
    { retry: false },
  );
  if (response.error) {
    const retried = await resendApi(() => resend.topics.list());
    const raced = retried.data?.data.find(
      (topic) => topic.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (raced) return requireFailClosed(raced);
    throw providerError("Creating the marketing topic", response.error.message);
  }
  return {
    id: response.data.id,
    name,
    description: "Product drops, subscriber offers, restocks and Y2KASE news.",
    default_subscription: "opt_out",
    created_at: new Date().toISOString(),
  };
}

export async function getMarketingProviderResources(): Promise<{
  segmentId: string;
  topicId: string;
}> {
  const resend = client();
  const [{ segment }, topic] = await Promise.all([
    resolveSegment(resend),
    resolveTopic(resend),
  ]);
  return { segmentId: segment.id, topicId: topic.id };
}

async function verifyMarketingWebhook(resend: Resend): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  const response = await resendApi(() => resend.webhooks.list({ limit: 100 }));
  if (response.error) {
    throw providerError("Verifying the Resend webhook", response.error.message);
  }
  const endpoint = `${SITE_URL.replace(/\/$/, "")}/api/webhooks/resend`;
  const requiredEvents = new Set([
    "contact.updated",
    "email.bounced",
    "email.complained",
    "email.suppressed",
  ]);
  const webhook = response.data.data.find(
    (item) =>
      item.status === "enabled" &&
      item.endpoint.replace(/\/$/, "") === endpoint,
  );
  if (!webhook) {
    throw new Error(`No enabled Resend webhook targets ${endpoint}.`);
  }
  const configuredEvents = new Set<string>(webhook.events ?? []);
  const missing = [...requiredEvents].filter(
    (event) => !configuredEvents.has(event),
  );
  if (missing.length > 0) {
    throw new Error(
      `Resend webhook is missing required events: ${missing.join(", ")}.`,
    );
  }
}

async function contactTopicSubscription(
  resend: Resend,
  email: string,
  topicId: string,
): Promise<"opt_in" | "opt_out" | null> {
  const response = await resendApi(() =>
    resend.contacts.topics.list({
      email,
      limit: 100,
    }),
  );
  if (response.error) {
    throw providerError(`Loading preferences for ${email}`, response.error.message);
  }
  return (
    response.data.data.find((topic) => topic.id === topicId)?.subscription ?? null
  );
}

async function setContactTopic(
  resend: Resend,
  email: string,
  topicId: string,
  subscription: "opt_in" | "opt_out",
) {
  const response = await resendApi(() =>
    resend.contacts.topics.update({
      email,
      topics: [{ id: topicId, subscription }],
    }),
  );
  if (response.error) {
    throw providerError(`Updating preferences for ${email}`, response.error.message);
  }
}

/**
 * Reconcile the database consent ledger into a dedicated Resend segment.
 *
 * Provider-side opt-outs always win. Contacts not present in the local consent
 * ledger are removed from an app-owned segment, preventing a legacy Resend
 * contact from accidentally entering a campaign.
 */
export async function syncMarketingAudience(): Promise<{
  segmentId: string;
  topicId: string;
  recipientCount: number;
  synchronizedCount: number;
  /** Server-only launch input; never returned from the admin Server Action. */
  eligibleEmails: string[];
}> {
  const resend = client();
  await verifyMarketingWebhook(resend);
  const [{ segment, owned }, topic, localSubscribers] = await Promise.all([
    resolveSegment(resend),
    resolveTopic(resend),
    db.query.emailSubscribers.findMany(),
  ]);
  const [providerContacts, segmentContacts] = await Promise.all([
    allContacts(resend),
    allContacts(resend, segment.id),
  ]);

  const providerByEmail = new Map(
    providerContacts.map((contact) => [contact.email.trim().toLowerCase(), contact]),
  );
  const segmentEmails = new Set(
    segmentContacts.map((contact) => contact.email.trim().toLowerCase()),
  );
  const localEmails = new Set(
    localSubscribers.map((subscriber) => subscriber.email.trim().toLowerCase()),
  );
  let recipientCount = 0;
  const eligibleEmails: string[] = [];

  for (const subscriber of localSubscribers) {
    const email = subscriber.email.trim().toLowerCase();
    const hasRecordedConsent =
      subscriber.status === "active" &&
      Boolean(subscriber.consentVersion) &&
      Boolean(subscriber.consentRecordedAt);
    const desired = hasRecordedConsent ? "opt_in" : "opt_out";
    const names = splitName(subscriber.name);
    let contact = providerByEmail.get(email);
    let currentTopic: "opt_in" | "opt_out" | null = null;

    if (!contact) {
      const created = await resendApi(() =>
        resend.contacts.create({
          email,
          unsubscribed: false,
          ...names,
          segments: [{ id: segment.id }],
          topics: [{ id: topic.id, subscription: desired }],
        }),
        { retry: false },
      );
      if (created.error) {
        throw providerError(`Creating contact ${email}`, created.error.message);
      }
      contact = {
        id: created.data.id,
        email,
        first_name: names.firstName ?? null,
        last_name: names.lastName ?? null,
        unsubscribed: false,
        created_at: new Date().toISOString(),
      };
      providerByEmail.set(email, contact);
      segmentEmails.add(email);
      currentTopic = desired;
    } else {
      if (
        subscriber.name &&
        (contact.first_name !== (names.firstName ?? null) ||
          contact.last_name !== (names.lastName ?? null))
      ) {
        const updated = await resendApi(() =>
          resend.contacts.update({
            email,
            firstName: names.firstName ?? null,
            lastName: names.lastName ?? null,
          }),
        );
        if (updated.error) {
          throw providerError(`Updating contact ${email}`, updated.error.message);
        }
      }
      if (!segmentEmails.has(email)) {
        const added = await resendApi(() =>
          resend.contacts.segments.add({
            email,
            segmentId: segment.id,
          }),
        );
        if (added.error) {
          throw providerError(`Adding ${email} to the marketing segment`, added.error.message);
        }
        segmentEmails.add(email);
      }
    }

    currentTopic ??= await contactTopicSubscription(resend, email, topic.id);
    const providerOptedOut =
      Boolean(contact.unsubscribed) || currentTopic === "opt_out";

    if (hasRecordedConsent && providerOptedOut) {
      await db
        .update(emailSubscribers)
        .set({
          status: "unsubscribed",
          unsubscribedAt: new Date(),
          unsubscribeReason: "provider_opt_out",
        })
        .where(eq(emailSubscribers.id, subscriber.id));
      continue;
    }
    if (!hasRecordedConsent && currentTopic !== "opt_out") {
      await setContactTopic(resend, email, topic.id, "opt_out");
      continue;
    }
    if (hasRecordedConsent && currentTopic !== "opt_in") {
      await setContactTopic(resend, email, topic.id, "opt_in");
    }
    if (hasRecordedConsent) {
      recipientCount += 1;
      eligibleEmails.push(email);
    }
  }

  const unknownContacts = segmentContacts.filter(
    (contact) => !localEmails.has(contact.email.trim().toLowerCase()),
  );
  const mayPrune = owned || process.env.RESEND_MARKETING_PRUNE_SEGMENT === "true";
  if (unknownContacts.length > 0 && !mayPrune) {
    throw new Error(
      `The configured Resend segment contains ${unknownContacts.length} contact${
        unknownContacts.length === 1 ? "" : "s"
      } outside the local consent ledger. Use a dedicated segment or explicitly enable pruning.`,
    );
  }
  if (mayPrune) {
    for (const contact of unknownContacts) {
      const email = contact.email.trim().toLowerCase();
      const removed = await resendApi(() =>
        resend.contacts.segments.remove({
          email,
          segmentId: segment.id,
        }),
      );
      if (removed.error) {
        throw providerError(
          `Removing an unknown contact from the marketing segment`,
          removed.error.message,
        );
      }
    }
  }

  return {
    segmentId: segment.id,
    topicId: topic.id,
    recipientCount,
    synchronizedCount: localSubscribers.length,
    eligibleEmails: eligibleEmails.sort(),
  };
}

/**
 * Freeze one reviewed audience into a campaign-specific segment. Resend resolves
 * scheduled segment membership at send time, so targeting the rolling master
 * segment would silently include subscribers who joined after final approval.
 */
export async function createMarketingAudienceSnapshot(input: {
  campaignId: string;
  campaignName: string;
  eligibleEmails: string[];
}): Promise<string> {
  if (input.eligibleEmails.length === 0) {
    throw new Error("Cannot snapshot an empty marketing audience.");
  }
  const resend = client();
  const safeName = input.campaignName.replace(/\s+/g, " ").trim().slice(0, 64);
  const created = await resendApi(() =>
    resend.segments.create({
      name: `[Campaign] ${safeName || "Y2KASE"} · ${input.campaignId.slice(0, 8)}`,
    }),
    { retry: false },
  );
  if (created.error) {
    throw providerError("Creating the campaign audience snapshot", created.error.message);
  }

  const segmentId = created.data.id;
  try {
    for (const email of input.eligibleEmails) {
      const added = await resendApi(() =>
        resend.contacts.segments.add({ email, segmentId }),
      );
      if (added.error) {
        throw providerError("Populating the campaign audience snapshot", added.error.message);
      }
    }
    return segmentId;
  } catch (error) {
    // No broadcast points at this incomplete segment yet, so cleanup is safe.
    const removed = await resendApi(() => resend.segments.remove(segmentId));
    if (removed.error) {
      console.error(
        "[campaigns] could not remove incomplete audience snapshot:",
        removed.error.message,
      );
    }
    throw error;
  }
}

/**
 * Best-effort single-contact propagation used by subscribe/unsubscribe/admin
 * mutations. Full pre-send reconciliation remains the final safety boundary.
 */
export async function syncSubscriberToResend(input: {
  email: string;
  name: string | null;
  status: "active" | "unsubscribed";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const resend = client();
    const [{ segment }, topic] = await Promise.all([
      resolveSegment(resend),
      resolveTopic(resend),
    ]);
    const email = input.email.trim().toLowerCase();
    const names = splitName(input.name);
    const fetched = await resendApi(() => resend.contacts.get({ email }));

    if (fetched.error?.name === "not_found") {
      const created = await resendApi(() =>
        resend.contacts.create({
          email,
          unsubscribed: false,
          ...names,
          segments: [{ id: segment.id }],
          topics: [
            {
              id: topic.id,
              subscription: input.status === "active" ? "opt_in" : "opt_out",
            },
          ],
        }),
        { retry: false },
      );
      if (created.error) throw providerError("Creating subscriber contact", created.error.message);
      return { ok: true };
    }
    if (fetched.error) {
      throw providerError("Loading subscriber contact", fetched.error.message);
    }

    const updated = await resendApi(() =>
      resend.contacts.update({
        email,
        ...(input.name
          ? {
              firstName: names.firstName ?? null,
              lastName: names.lastName ?? null,
            }
          : {}),
        // Reactivation is an explicit admin/customer opt-in. Unsubscribing only
        // changes the marketing topic so transactional receipts remain deliverable.
        ...(input.status === "active" ? { unsubscribed: false } : {}),
      }),
    );
    if (updated.error) {
      throw providerError("Updating subscriber contact", updated.error.message);
    }

    const segments = await resendApi(() =>
      resend.contacts.segments.list({
        email,
        limit: 100,
      }),
    );
    if (segments.error) {
      throw providerError("Loading subscriber segments", segments.error.message);
    }
    if (!segments.data.data.some((item) => item.id === segment.id)) {
      const added = await resendApi(() =>
        resend.contacts.segments.add({
          email,
          segmentId: segment.id,
        }),
      );
      if (added.error) {
        throw providerError("Adding subscriber to the marketing segment", added.error.message);
      }
    }

    await setContactTopic(
      resend,
      email,
      topic.id,
      input.status === "active" ? "opt_in" : "opt_out",
    );
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Audience sync failed.",
    };
  }
}

/** Pull a provider-side global/topic opt-out into the local consent ledger. */
export async function reconcileResendContact(email: string): Promise<void> {
  const resend = client();
  const topic = await resolveTopic(resend);
  const normalized = email.trim().toLowerCase();
  const fetched = await resendApi(() =>
    resend.contacts.get({ email: normalized }),
  );
  if (fetched.error) {
    if (fetched.error.name === "not_found") return;
    throw providerError("Loading webhook contact", fetched.error.message);
  }
  const subscription = await contactTopicSubscription(
    resend,
    normalized,
    topic.id,
  );
  if (!fetched.data.unsubscribed && subscription !== "opt_out") return;
  await db
    .update(emailSubscribers)
    .set({
      status: "unsubscribed",
      unsubscribedAt: new Date(),
      unsubscribeReason: "provider_opt_out",
    })
    .where(eq(emailSubscribers.email, normalized));
}

export async function sendMarketingTest(input: {
  to: string;
  campaignId: string;
  contentHash: string;
  testAttemptId: string;
  subject: string;
  html: string;
  text: string;
}): Promise<string> {
  const resend = client();
  const response = await resendApi(() =>
    resend.emails.send({
      from: marketingSender(),
      replyTo: EMAIL_REPLY_TO,
      to: input.to,
      subject: `[TEST] ${input.subject}`,
      html: input.html,
      text: input.text,
      tags: [{ name: "campaign", value: input.campaignId }],
    }, {
      idempotencyKey: `marketing-test-${input.campaignId}-${input.contentHash}-${input.testAttemptId}`,
    }),
  );
  if (response.error) {
    throw providerError("Sending the test email", response.error.message);
  }
  return response.data.id;
}

export async function createMarketingBroadcastDraft(input: {
  draft: MarketingDraft;
  segmentId: string;
  topicId: string;
  html: string;
  text: string;
}): Promise<string> {
  const resend = client();
  const response = await resendApi(() =>
    resend.broadcasts.create({
      segmentId: input.segmentId,
      topicId: input.topicId,
      name: input.draft.name,
      from: marketingSender(),
      replyTo: EMAIL_REPLY_TO,
      subject: input.draft.subject,
      previewText: input.draft.previewText,
      html: input.html,
      text: input.text,
      send: false,
    }),
    { retry: false },
  );
  if (response.error) {
    throw providerError("Creating the provider broadcast", response.error.message);
  }
  return response.data.id;
}

export async function updateMarketingBroadcastDraft(
  broadcastId: string,
  input: {
    draft: MarketingDraft;
    segmentId: string;
    topicId: string;
    html: string;
    text: string;
  },
): Promise<void> {
  const resend = client();
  const response = await resendApi(() =>
    resend.broadcasts.update(broadcastId, {
      segmentId: input.segmentId,
      topicId: input.topicId,
      name: input.draft.name,
      from: marketingSender(),
      replyTo: [EMAIL_REPLY_TO],
      subject: input.draft.subject,
      previewText: input.draft.previewText,
      html: input.html,
      text: input.text,
    }),
  );
  if (response.error) {
    throw providerError("Updating the provider broadcast", response.error.message);
  }
}

export async function sendMarketingBroadcast(
  broadcastId: string,
  scheduledAt: string | null,
): Promise<void> {
  const resend = client();
  const response = await resendApi(() =>
    resend.broadcasts.send(
      broadcastId,
      scheduledAt ? { scheduledAt } : undefined,
    ),
    { retry: false },
  );
  if (response.error) {
    throw providerError("Launching the provider broadcast", response.error.message);
  }
}

export async function getMarketingBroadcast(
  broadcastId: string,
): Promise<Broadcast | null> {
  const resend = client();
  const response = await resendApi(() =>
    resend.broadcasts.get(broadcastId),
  );
  if (response.error) {
    if (response.error.name === "not_found") return null;
    throw providerError("Loading the provider broadcast", response.error.message);
  }
  return response.data;
}

export async function removeMarketingBroadcastDraft(
  broadcastId: string,
): Promise<boolean> {
  const resend = client();
  const response = await resendApi(() =>
    resend.broadcasts.remove(broadcastId),
  );
  if (response.error) {
    if (response.error.name === "not_found") return true;
    console.error(
      "[campaigns] provider draft cleanup failed:",
      response.error.message,
    );
    return false;
  }
  return true;
}

export async function removeMarketingSegment(
  segmentId: string,
): Promise<boolean> {
  const resend = client();
  const response = await resendApi(() => resend.segments.remove(segmentId));
  if (response.error) {
    if (response.error.name === "not_found") return true;
    console.error(
      "[campaigns] audience snapshot cleanup failed:",
      response.error.message,
    );
    return false;
  }
  return true;
}

export async function refreshMarketingCampaignStatuses(): Promise<number> {
  const campaigns = await db.query.marketingCampaigns.findMany({
    where: inArray(marketingCampaigns.status, ["queued", "scheduled"]),
  });
  let updated = 0;
  for (const campaign of campaigns) {
    if (!campaign.resendBroadcastId) continue;
    const broadcast = await getMarketingBroadcast(campaign.resendBroadcastId);
    if (!broadcast) {
      await db
        .update(marketingCampaigns)
        .set({
          status: "failed",
          scheduledAt: null,
          lastError:
            "The linked broadcast no longer exists in Resend. Review before retrying.",
          updatedAt: new Date(),
        })
        .where(eq(marketingCampaigns.id, campaign.id));
      updated += 1;
      continue;
    }
    if (broadcast.status === "sent") {
      await db
        .update(marketingCampaigns)
        .set({
          status: "sent",
          sentAt: broadcast.sent_at ? new Date(broadcast.sent_at) : new Date(),
          updatedAt: new Date(),
        })
        .where(eq(marketingCampaigns.id, campaign.id));
      updated += 1;
    } else if (broadcast.status === "draft") {
      await db
        .update(marketingCampaigns)
        .set({
          status: "cancelled",
          scheduledAt: null,
          lastError:
            campaign.status === "queued"
              ? "Cancelled in Resend; some queued deliveries may already have been sent."
              : "Cancelled in Resend before the scheduled send.",
          updatedAt: new Date(),
        })
        .where(eq(marketingCampaigns.id, campaign.id));
      updated += 1;
    }
  }
  return updated;
}


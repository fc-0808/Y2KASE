import "server-only";

/** Physical sender address required in commercial-email footers. */
export function marketingPostalAddress(): string | null {
  const value = process.env.MARKETING_POSTAL_ADDRESS?.trim();
  return value && value.length >= 6 ? value : null;
}

/** Strip any display name, leaving the bare mailbox, lowercased for comparison. */
function mailbox(sender: string): string {
  const value = sender.trim();
  return (value.match(/<([^<>]+)>\s*$/)?.[1]?.trim() || value).toLowerCase();
}

/**
 * Campaign mail must never silently fall back to the receipt/sign-in sender.
 *
 * The comparison is between mailboxes, not between the raw configured strings.
 * "Y2KASE <orders@…>" and "Y2KASE Club <orders@…>" are different strings but the
 * same sending identity, so comparing raw values would call a shared mailbox
 * "separated" and let campaign volume damage the deliverability of receipts and
 * sign-in links — the exact outcome this gate exists to prevent.
 */
export function isMarketingSenderConfigured(): boolean {
  const marketing = mailbox(process.env.EMAIL_FROM_MARKETING?.trim() ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(marketing)) return false;
  const transactional = mailbox(
    process.env.EMAIL_FROM?.trim() || "Y2KASE <orders@send.y2kase.com>",
  );
  return marketing !== transactional;
}

function configuredUuid(name: string): string | null {
  const value = process.env[name]?.trim() ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : null;
}

export function configuredMarketingTopicId(): string | null {
  return configuredUuid("RESEND_MARKETING_TOPIC_ID");
}

export function configuredMarketingSegmentId(): string | null {
  return configuredUuid("RESEND_MARKETING_SEGMENT_ID");
}

export function isMarketingSendEnabled(): boolean {
  return process.env.MARKETING_SEND_ENABLED === "true";
}

/**
 * Every precondition a commercial send must satisfy, answered once.
 *
 * The send helpers and the crons that drive them need the same verdict, and a
 * cron that only discovers "marketing is disabled" inside the send call has
 * already claimed a row and spent a Stripe session lookup to learn something a
 * handful of environment reads could have told it up front.
 *
 * Reports the unmet variable *names* — never their values — so a silent
 * no-send explains itself in the logs instead of requiring someone to diff the
 * deployment environment.
 */
export type MarketingMailReadiness =
  | { ready: true; postalAddress: string; topicId: string }
  | { ready: false; missing: string[] };

export function marketingMailReadiness(): MarketingMailReadiness {
  const missing: string[] = [];
  if (!isMarketingSendEnabled()) missing.push("MARKETING_SEND_ENABLED");
  const postalAddress = marketingPostalAddress();
  if (!postalAddress) missing.push("MARKETING_POSTAL_ADDRESS");
  if (!isMarketingSenderConfigured()) missing.push("EMAIL_FROM_MARKETING");
  const topicId = configuredMarketingTopicId();
  if (!topicId) missing.push("RESEND_MARKETING_TOPIC_ID");

  return postalAddress && topicId && missing.length === 0
    ? { ready: true, postalAddress, topicId }
    : { ready: false, missing };
}

export function marketingMaxRecipients(): number {
  // Current audience reconciliation intentionally serializes provider writes.
  // Keep synchronous launches well inside the 120-second function budget until
  // a durable bulk/background worker replaces this path.
  const hardSynchronousCap = 25;
  const parsed = Number(
    process.env.MARKETING_MAX_RECIPIENTS ?? hardSynchronousCap,
  );
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, hardSynchronousCap)
    : hardSynchronousCap;
}

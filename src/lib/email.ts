/**
 * Transactional email — SERVER ONLY.
 *
 * Uses Resend (the Next.js-native email API) + the react-email template in
 * src/emails. Sending is:
 *   - Best-effort: a failure NEVER throws into the webhook, so a flaky email
 *     provider can't cause Stripe to retry an already-fulfilled order.
 *   - Exactly-once: we atomically "claim" the send via the
 *     orders.confirmation_email_sent_at column before sending, and release the
 *     claim if the send fails so a later webhook redelivery can retry.
 */
import { and, eq, isNull } from "drizzle-orm";
import { render } from "@react-email/components";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { OrderConfirmation } from "@/emails/OrderConfirmation";
import { MagicLinkEmail } from "@/emails/MagicLinkEmail";
import { ShipmentEmail } from "@/emails/ShipmentEmail";
import { AbandonedCartEmail } from "@/emails/AbandonedCartEmail";
import { ReviewRequestEmail } from "@/emails/ReviewRequestEmail";
import { trackingLink } from "@/lib/carriers";
import { SUPPORT_EMAIL } from "@/lib/support/constants";

let _resend: Resend | null = null;

/**
 * The shared Resend client. Exported so every sender in the app goes through
 * one construction path — a route that builds its own client also ends up with
 * its own idea of what the `from` address is, which is precisely how the
 * subscribe route came to send from the sandbox domain while everything else
 * used the verified one.
 *
 * Lazily constructed so a missing key can't crash the module at import time
 * (which would 500 the whole route instead of degrading gracefully).
 */
export function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export const isEmailConfigured = () => Boolean(process.env.RESEND_API_KEY);

/**
 * Which reputation pool an email belongs to.
 *
 * WHY THE SPLIT EXISTS
 * Mailbox providers score senders on complaint rate. Marketing mail earns
 * complaints and unsubscribes as a matter of course; transactional mail must
 * arrive no matter what, because it carries order confirmations and sign-in
 * links. Sharing one identity means a single bad promo can degrade delivery of
 * the receipt for a payment someone already made — a support problem, and a
 * legal one if a customer never learns their order shipped.
 *
 * WHERE THE LINE IS DRAWN
 * An email is marketing if it carries a `List-Unsubscribe` header. That is not
 * a coincidence: legally, anything a recipient may opt out of is solicitation,
 * and anything they may not is transactional. Using the header as the test
 * keeps the classification honest and impossible to drift from the law.
 *
 *   transactional — order confirmation, shipment notice, magic-link sign-in
 *   marketing     — welcome/scratch code, abandoned cart, review request
 */
export type MailStream = "transactional" | "marketing";

/**
 * Transactional sender. SINGLE SOURCE OF TRUTH.
 *
 * The fallback is `send.y2kase.com` because that is the subdomain actually
 * verified in Resend. The apex `y2kase.com` is NOT verified and has no DKIM
 * records, so Resend rejects it with a 403 — a fallback pointing there would
 * fail every send the moment the env var went missing, which is the opposite
 * of what a fallback is for.
 *
 * Do NOT fall back to `onboarding@resend.dev`: that shared sandbox sender only
 * delivers to the Resend account owner's own address and 403s for every real
 * shopper, which is a failure mode that looks like success from the outside.
 */
export const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "Y2KASE <orders@send.y2kase.com>";

/**
 * Marketing sender.
 *
 * Falls back to the transactional address so an unset variable degrades to
 * exactly today's behaviour rather than to a broken one.
 *
 * CURRENT STATE: a distinct mailbox on the same verified domain. That buys a
 * separate sender identity in the inbox — recipients and filters can tell a
 * promo from a receipt, and Gmail will stop threading them together — but NOT
 * separate domain reputation, which is the part that actually protects
 * deliverability.
 *
 * FULL ISOLATION is one env var away: verify a second subdomain in Resend
 * (`news.y2kase.com`) and set EMAIL_FROM_MARKETING to an address on it. No code
 * changes. That is blocked today only because the Resend free plan allows a
 * single domain.
 */
export const EMAIL_FROM_MARKETING =
  process.env.EMAIL_FROM_MARKETING ?? EMAIL_FROM;

/**
 * Replies land with a human.
 *
 * `send.y2kase.com` has receiving disabled, so a reply to `orders@` or `club@`
 * would vanish silently. Every send sets Reply-To to the real support inbox.
 */
export const EMAIL_REPLY_TO = SUPPORT_EMAIL;

/** The From address for a given stream. */
export function senderFor(stream: MailStream): string {
  return stream === "marketing" ? EMAIL_FROM_MARKETING : EMAIL_FROM;
}
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

/**
 * Send the order-confirmation email exactly once. Safe to call on every webhook
 * delivery — only the first successful caller actually sends.
 *
 * Returns "sent" | "skipped" | "failed" for observability.
 */
export async function sendOrderConfirmationOnce(
  orderId: number,
): Promise<"sent" | "skipped" | "failed"> {
  const resend = getResend();
  if (!resend) {
    // Email not configured — don't claim, so it can send once keys are added.
    console.warn("[email] RESEND_API_KEY not set; skipping confirmation email.");
    return "skipped";
  }

  // Atomically claim the send. If no row comes back, someone already claimed it.
  const claimed = await db
    .update(orders)
    .set({ confirmationEmailSentAt: new Date() })
    .where(and(eq(orders.id, orderId), isNull(orders.confirmationEmailSentAt)))
    .returning({ id: orders.id, email: orders.email });

  if (claimed.length === 0) return "skipped";

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: { items: true },
  });

  if (!order || !order.email) {
    // Can't send without a recipient — release the claim for a future retry.
    await releaseClaim(orderId);
    return "failed";
  }

  try {
    // Render to HTML + plain text ourselves (more reliable than the Resend
    // SDK's built-in React rendering, which depends on package resolution).
    const element = OrderConfirmation({
      orderId: order.id,
      currency: order.currency,
      items: order.items.map((it) => ({
        title: it.productTitle,
        imageUrl: it.imageUrl,
        options: it.optionValues ?? null,
        quantity: it.quantity,
        unitCents: it.unitCents,
      })),
      subtotalCents: order.subtotalCents,
      shippingCents: order.shippingCents,
      totalCents: order.totalCents,
      shippingAddress: order.shippingAddress ?? null,
      siteUrl: SITE_URL,
    });
    const [html, text] = await Promise.all([
      render(element),
      render(element, { plainText: true }),
    ]);

    await resend.emails.send({
      from: senderFor("transactional"),
      replyTo: EMAIL_REPLY_TO,
      to: order.email,
      subject: `Your Y2KASE order #${order.id} is confirmed ✨`,
      html,
      text,
    });
    return "sent";
  } catch (err) {
    console.error(`[email] failed to send confirmation for order ${orderId}:`, err);
    await releaseClaim(orderId);
    return "failed";
  }
}

/**
 * Send the shipment-notification email exactly once for an order. Claims the
 * send atomically via orders.shipment_email_sent_at, releasing the claim on
 * failure so it can be retried. Best-effort: returns a status, never throws.
 */
export async function sendShipmentNotificationOnce(
  orderId: number,
): Promise<"sent" | "skipped" | "failed"> {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set; skipping shipment email.");
    return "skipped";
  }

  const claimed = await db
    .update(orders)
    .set({ shipmentEmailSentAt: new Date() })
    .where(and(eq(orders.id, orderId), isNull(orders.shipmentEmailSentAt)))
    .returning({ id: orders.id });

  if (claimed.length === 0) return "skipped";

  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: { items: true },
  });

  if (!order || !order.email) {
    await releaseShipmentClaim(orderId);
    return "failed";
  }

  try {
    const element = ShipmentEmail({
      orderId: order.id,
      name: order.shippingAddress?.name,
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      trackingUrl: trackingLink(
        order.carrier,
        order.trackingNumber,
        order.trackingUrl,
      ),
      items: order.items.map((it) => ({
        title: it.productTitle,
        quantity: it.quantity,
      })),
      siteUrl: SITE_URL,
    });
    const [html, text] = await Promise.all([
      render(element),
      render(element, { plainText: true }),
    ]);

    await resend.emails.send({
      from: senderFor("transactional"),
      replyTo: EMAIL_REPLY_TO,
      to: order.email,
      subject: `Your Y2KASE order #${order.id} has shipped 📦✨`,
      html,
      text,
    });
    return "sent";
  } catch (err) {
    console.error(`[email] failed to send shipment email for order ${orderId}:`, err);
    await releaseShipmentClaim(orderId);
    return "failed";
  }
}

/**
 * Send a passwordless magic sign-in link. Called by Better Auth's magic-link
 * plugin (see src/lib/auth.ts). Throws on failure so Better Auth surfaces the
 * error to the caller instead of silently telling the user "check your email".
 */
export async function sendMagicLinkEmail(params: {
  email: string;
  url: string;
  expiresInMinutes?: number;
}): Promise<void> {
  const resend = getResend();
  if (!resend) {
    // Fail loud in dev so the link can be grabbed from server logs.
    console.warn(
      `[email] RESEND_API_KEY not set; magic link for ${params.email}: ${params.url}`,
    );
    throw new Error("Email delivery is not configured.");
  }

  const element = MagicLinkEmail({
    url: params.url,
    expiresInMinutes: params.expiresInMinutes,
  });
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);

  await resend.emails.send({
    // Always transactional, and the stream that matters most: if a sign-in link
    // lands in spam the shopper cannot get into their account at all.
    from: senderFor("transactional"),
    replyTo: EMAIL_REPLY_TO,
    to: params.email,
    subject: "Your Y2KASE sign-in link ✨",
    html,
    text,
  });
}

/**
 * Send an abandoned-cart reminder. Best-effort; returns whether it sent. The
 * exactly-once guard (orders.abandoned_email_sent_at) is owned by the caller
 * (the cron job) so it can claim before the network round-trip.
 */
export async function sendAbandonedCartEmail(params: {
  to: string;
  name?: string;
  items: { title: string; quantity: number }[];
  resumeUrl: string;
  unsubscribeUrl?: string;
}): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;

  try {
    const element = AbandonedCartEmail({
      name: params.name,
      items: params.items,
      resumeUrl: params.resumeUrl,
      unsubscribeUrl: params.unsubscribeUrl,
    });
    const [html, text] = await Promise.all([
      render(element),
      render(element, { plainText: true }),
    ]);

    await resend.emails.send({
      from: senderFor("marketing"),
      replyTo: EMAIL_REPLY_TO,
      to: params.to,
      subject: "You left something cute in your bag 🥺✨",
      html,
      text,
      ...(params.unsubscribeUrl
        ? {
            headers: {
              "List-Unsubscribe": `<${params.unsubscribeUrl}>`,
            },
          }
        : {}),
    });
    return true;
  } catch (err) {
    console.error("[email] abandoned-cart send failed:", err);
    return false;
  }
}

/**
 * Send a post-purchase review-request email. Best-effort; returns whether it
 * sent. Exactly-once is owned by the caller (the cron) via
 * orders.review_request_email_sent_at.
 */
export async function sendReviewRequestEmail(params: {
  to: string;
  name?: string;
  productTitle: string;
  reviewUrl: string;
  unsubscribeUrl?: string;
}): Promise<boolean> {
  const resend = getResend();
  if (!resend) return false;

  try {
    const element = ReviewRequestEmail({
      name: params.name,
      productTitle: params.productTitle,
      reviewUrl: params.reviewUrl,
      unsubscribeUrl: params.unsubscribeUrl,
    });
    const [html, text] = await Promise.all([
      render(element),
      render(element, { plainText: true }),
    ]);

    await resend.emails.send({
      from: senderFor("marketing"),
      replyTo: EMAIL_REPLY_TO,
      to: params.to,
      subject: "How are you loving your Y2KASE order? ⭐",
      html,
      text,
      ...(params.unsubscribeUrl
        ? { headers: { "List-Unsubscribe": `<${params.unsubscribeUrl}>` } }
        : {}),
    });
    return true;
  } catch (err) {
    console.error("[email] review-request send failed:", err);
    return false;
  }
}

/** Release the email claim so a webhook redelivery can retry the send. */
async function releaseClaim(orderId: number) {
  try {
    await db
      .update(orders)
      .set({ confirmationEmailSentAt: null })
      .where(eq(orders.id, orderId));
  } catch (err) {
    console.error(`[email] failed to release claim for order ${orderId}:`, err);
  }
}

/** Release the shipment-email claim so a later attempt can retry the send. */
async function releaseShipmentClaim(orderId: number) {
  try {
    await db
      .update(orders)
      .set({ shipmentEmailSentAt: null })
      .where(eq(orders.id, orderId));
  } catch (err) {
    console.error(`[email] failed to release shipment claim for order ${orderId}:`, err);
  }
}

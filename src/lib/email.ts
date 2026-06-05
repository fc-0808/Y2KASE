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

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export const isEmailConfigured = () => Boolean(process.env.RESEND_API_KEY);

const FROM =
  process.env.EMAIL_FROM ?? "Y2KASE <orders@y2kase.com>";
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
      from: FROM,
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
    from: FROM,
    to: params.email,
    subject: "Your Y2KASE sign-in link ✨",
    html,
    text,
  });
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

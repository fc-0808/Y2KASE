/**
 * Email unsubscribe — SERVER ONLY.
 *
 * Marketing emails legally need a working, frictionless opt-out (CAN-SPAM,
 * GDPR/PECR) and Gmail/Yahoo now require RFC 8058 one-click unsubscribe for bulk
 * senders or they hurt deliverability. We sign each recipient's address with an
 * HMAC so the unsubscribe link needs no database token column and can't be
 * forged or enumerated.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailSubscribers } from "@/lib/db/schema";
import { SUPPORT_EMAIL } from "@/lib/legal";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

function secret(): string {
  return process.env.BETTER_AUTH_SECRET || "y2kase-unsubscribe-secret";
}

/** Deterministic, unforgeable token for an email address. */
export function unsubscribeToken(email: string): string {
  return createHmac("sha256", secret())
    .update(email.trim().toLowerCase())
    .digest("hex");
}

/** Constant-time verification of an (email, token) pair. */
export function verifyUnsubscribe(email: string, token: string): boolean {
  if (!email || !token) return false;
  const expected = unsubscribeToken(email);
  if (expected.length !== token.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}

/** Human-facing confirmation page link (used in the email body). */
export function unsubscribeUrl(email: string): string {
  const e = encodeURIComponent(email);
  const t = unsubscribeToken(email);
  return `${SITE_URL}/unsubscribe?e=${e}&t=${t}`;
}

/** Machine endpoint hit by mail clients for RFC 8058 one-click unsubscribe. */
export function unsubscribeApiUrl(email: string): string {
  const e = encodeURIComponent(email);
  const t = unsubscribeToken(email);
  return `${SITE_URL}/api/unsubscribe?e=${e}&t=${t}`;
}

/**
 * Headers that enable one-click unsubscribe in Gmail/Apple Mail/Outlook.
 * Spread onto a Resend `emails.send({ headers })` call for marketing mail only.
 */
export function listUnsubscribeHeaders(email: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<mailto:${SUPPORT_EMAIL}?subject=unsubscribe>, <${unsubscribeApiUrl(email)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/**
 * Mark a verified subscriber as unsubscribed. Idempotent. Returns true when the
 * token is valid (whether or not a row existed), false when verification fails.
 */
export async function applyUnsubscribe(
  email: string,
  token: string,
): Promise<boolean> {
  if (!verifyUnsubscribe(email, token)) return false;
  const normalized = email.trim().toLowerCase();
  try {
    await db
      .update(emailSubscribers)
      .set({ status: "unsubscribed", unsubscribedAt: new Date() })
      .where(eq(emailSubscribers.email, normalized));
  } catch (err) {
    console.error("[unsubscribe] db update failed:", err);
  }
  return true;
}

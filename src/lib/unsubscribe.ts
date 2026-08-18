/**
 * Email unsubscribe — SERVER ONLY.
 *
 * Marketing emails legally need a working, frictionless opt-out (CAN-SPAM,
 * GDPR/PECR) and Gmail/Yahoo now require RFC 8058 one-click unsubscribe for bulk
 * senders or they hurt deliverability. We sign each recipient's address with an
 * HMAC so the unsubscribe link needs no database token column and can't be
 * forged or enumerated.
 */
import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { emailSubscribers } from "@/lib/db/schema";
import { SUPPORT_EMAIL } from "@/lib/legal";
import { preserveHardSuppressionReason } from "@/lib/marketing/consent";
import { SITE_URL } from "@/lib/site";

function currentSecret(): string {
  const value =
    process.env.UNSUBSCRIBE_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    "";
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "UNSUBSCRIBE_SECRET or BETTER_AUTH_SECRET is required in production.",
    );
  }
  return "y2kase-local-unsubscribe-secret";
}

/** Deterministic, unforgeable token for an email address. */
export function unsubscribeToken(email: string): string {
  return createHmac("sha256", currentSecret())
    .update(email.trim().toLowerCase())
    .digest("hex");
}

/** Constant-time verification of an (email, token) pair. */
export function verifyUnsubscribe(email: string, token: string): boolean {
  if (!email || !token) return false;
  const secrets = [
    currentSecret(),
    process.env.UNSUBSCRIBE_PREVIOUS_SECRET?.trim(),
    ...(process.env.UNSUBSCRIBE_LEGACY_SECRETS ?? "")
      .split(",")
      .map((value) => value.trim()),
  ].filter((value): value is string => Boolean(value));
  for (const secret of secrets) {
    const expected = createHmac("sha256", secret)
      .update(email.trim().toLowerCase())
      .digest("hex");
    if (expected.length !== token.length) continue;
    try {
      if (timingSafeEqual(Buffer.from(expected), Buffer.from(token))) return true;
    } catch {
      // Malformed token encoding/length is simply invalid.
    }
  }
  return false;
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
  let subscriber: { name: string | null } | undefined;
  try {
    [subscriber] = await db
      .insert(emailSubscribers)
      .values({
        email: normalized,
        source: "unsubscribe",
        status: "unsubscribed",
        unsubscribedAt: new Date(),
        unsubscribeReason: "customer_one_click",
      })
      .onConflictDoUpdate({
        target: emailSubscribers.email,
        set: {
          status: "unsubscribed",
          unsubscribedAt: new Date(),
          unsubscribeReason: preserveHardSuppressionReason("customer_one_click"),
        },
      })
      .returning({ name: emailSubscribers.name });
  } catch (err) {
    // Returning false makes RFC 8058 callers retry instead of acknowledging an
    // opt-out that the consent ledger failed to persist.
    console.error("[unsubscribe] db update failed:", err);
    return false;
  }

  if (subscriber) {
    try {
      // Keep the generic URL/header helpers out of an email.ts ↔ marketing
      // provider import cycle; delivery code is needed only for this mutation.
      const { syncSubscriberToResend } = await import("@/lib/marketing/resend");
      const provider = await syncSubscriberToResend({
        email: normalized,
        name: subscriber.name,
        status: "unsubscribed",
      });
      if (!provider.ok) {
        console.error("[unsubscribe] Resend sync failed:", provider.error);
      }
    } catch (err) {
      // The local ledger already suppresses the address. Provider sync is
      // best-effort here and is retried by the mandatory pre-send reconcile.
      console.error("[unsubscribe] Resend sync failed:", err);
    }
  }
  return true;
}

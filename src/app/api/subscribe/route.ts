/**
 * POST /api/subscribe
 *
 * Accepts an email (and optional name) from the welcome pop-up or footer form.
 * - Upserts the subscriber in the DB (idempotent on email).
 * - Issues whichever coupon this visitor is owed.
 * - Sends a branded welcome email with the discount code.
 *
 * WHICH CODE GETS ISSUED
 * WELCOME_COUPON (BESTIE10) by default. If a legacy scratch-draw cookie is still
 * present (see `@/lib/scratch`), that signed httpOnly cookie wins instead — so
 * anyone who played the old scratch card before we retired it still receives the
 * tier they were promised. No cookie — footer signup, blocked cookie, expired
 * draw — falls back to the public welcome coupon.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailSubscribers } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { render } from "@react-email/components";
import { WelcomeEmail } from "@/emails/WelcomeEmail";
import { enforceRateLimit } from "@/lib/rate-limit";
import { listUnsubscribeHeaders, unsubscribeUrl } from "@/lib/unsubscribe";
import { WELCOME_COUPON, resolveLocalCoupon } from "@/lib/promotions";
import { SCRATCH_COOKIE, decodeScratchCookie, prizeCoupon } from "@/lib/scratch";
// The shared client and sender, NOT a local copy. This route used to construct
// its own and default to `onboarding@resend.dev`, so it quietly sent from a
// different identity than the rest of the app — and Resend 403s that sandbox
// sender for anyone but the account owner.
import { EMAIL_REPLY_TO, getResend, senderFor } from "@/lib/email";
import { syncSubscriberToResend } from "@/lib/marketing/resend";
import {
  configuredMarketingTopicId,
  isMarketingSendEnabled,
  isMarketingSenderConfigured,
  marketingPostalAddress,
} from "@/lib/marketing/compliance";
import { marketingConsentEvidence } from "@/lib/marketing/consent";
import { recordMarketingSend } from "@/lib/marketing/send-log";

export const runtime = "nodejs";

const SUBSCRIPTION_SOURCES = new Set([
  "popup",
  "exit-intent",
  "welcome-card",
  "footer",
  "checkout",
]);

function subscriptionSource(value: unknown): string {
  return typeof value === "string" && SUBSCRIPTION_SOURCES.has(value)
    ? value
    : "popup";
}

export async function POST(request: NextRequest) {
  // Throttle to blunt automated signup spam against the email provider.
  const limited = enforceRateLimit(request, "subscribe", {
    limit: 5,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const parsed: unknown = await request.json().catch(() => null);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const body = parsed as Record<string, unknown>;
    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";
    const name =
      typeof body.name === "string"
        ? body.name.trim().slice(0, 120) || null
        : null;
    const source = subscriptionSource(body.source);
    const consentEvidence = marketingConsentEvidence(request);
    const consentRecordedAt = new Date();

    if (
      !email ||
      email.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return NextResponse.json({ error: "Invalid email." }, { status: 400 });
    }

    // The prize the server drew for this visitor, read back from its signed
    // cookie. Never from the body — that would let anyone name their own tier.
    const prize = decodeScratchCookie(request.cookies.get(SCRATCH_COOKIE)?.value);
    const won = prize ? prizeCoupon(prize) : null;
    const coupon = won ?? WELCOME_COUPON;

    // Check if already subscribed. Active members are idempotent; someone who
    // explicitly submits after unsubscribing is making a new opt-in and must be
    // reactivated rather than silently left on the suppression list.
    const existing = await db
      .select({
        id: emailSubscribers.id,
        status: emailSubscribers.status,
        name: emailSubscribers.name,
        discountCode: emailSubscribers.discountCode,
        consentVersion: emailSubscribers.consentVersion,
        consentRecordedAt: emailSubscribers.consentRecordedAt,
        unsubscribeReason: emailSubscribers.unsubscribeReason,
      })
      .from(emailSubscribers)
      .where(eq(emailSubscribers.email, email))
      .limit(1);

    let issued = coupon;
    let reactivated = false;
    let welcomeIdempotencyKey: string | null = null;

    if (existing.length > 0) {
      // Always preserve the originally issued tier. Re-subscribing must not be
      // a way to repeatedly draw or shop for a better code.
      const held = resolveLocalCoupon(existing[0].discountCode) ?? coupon;
      issued = held;

      if (existing[0].status !== "unsubscribed") {
        if (
          !existing[0].consentVersion ||
          !existing[0].consentRecordedAt
        ) {
          const [upgraded] = await db
            .update(emailSubscribers)
            .set({
              ...consentEvidence,
              consentRecordedAt,
              source,
              ...(name ? { name } : {}),
            })
            .where(
              and(
                eq(emailSubscribers.id, existing[0].id),
                eq(emailSubscribers.status, "active"),
              ),
            )
            .returning({ name: emailSubscribers.name });
          if (upgraded) {
            const provider = await syncSubscriberToResend({
              email,
              name: upgraded.name,
              status: "active",
            });
            if (!provider.ok) {
              console.error(
                "[subscribe] legacy consent provider sync failed:",
                provider.error,
              );
            }
          }
        }
        return NextResponse.json({
          ok: true,
          code: held.code,
          percentOff: held.percentOff,
          alreadySubscribed: true,
        });
      }
      if (
        existing[0].unsubscribeReason === "bounce" ||
        existing[0].unsubscribeReason === "complaint" ||
        existing[0].unsubscribeReason === "suppressed"
      ) {
        return NextResponse.json(
          {
            error:
              "This address cannot be reactivated automatically. Please contact support.",
          },
          { status: 409 },
        );
      }

      const [claimed] = await db
        .update(emailSubscribers)
        .set({
          status: "active",
          unsubscribedAt: null,
          subscribedAt: new Date(),
          resubscribedAt: new Date(),
          unsubscribeReason: null,
          discountCode: held.code,
          ...consentEvidence,
          consentRecordedAt,
          source,
          ...(name ? { name } : {}),
        })
        .where(
          and(
            eq(emailSubscribers.id, existing[0].id),
            eq(emailSubscribers.status, "unsubscribed"),
          ),
        )
        .returning({
          id: emailSubscribers.id,
          subscribedAt: emailSubscribers.subscribedAt,
        });
      if (!claimed) {
        // A concurrent submission already restored consent and owns the welcome
        // send. Treat this request as idempotent instead of sending twice.
        return NextResponse.json({
          ok: true,
          code: held.code,
          percentOff: held.percentOff,
          alreadySubscribed: true,
        });
      }
      welcomeIdempotencyKey = `welcome-${claimed.id}-${claimed.subscribedAt.getTime()}`;
      reactivated = true;
    } else {
      const inserted = await db
        .insert(emailSubscribers)
        .values({
          email,
          name,
          source,
          discountCode: coupon.code,
          status: "active",
          ...consentEvidence,
          consentRecordedAt,
        })
        .onConflictDoNothing({ target: emailSubscribers.email })
        .returning({
          id: emailSubscribers.id,
          subscribedAt: emailSubscribers.subscribedAt,
        });
      if (inserted.length === 0) {
        const [winner] = await db
          .select({ discountCode: emailSubscribers.discountCode })
          .from(emailSubscribers)
          .where(eq(emailSubscribers.email, email))
          .limit(1);
        const held = resolveLocalCoupon(winner?.discountCode) ?? coupon;
        return NextResponse.json({
          ok: true,
          code: held.code,
          percentOff: held.percentOff,
          alreadySubscribed: true,
        });
      }
      welcomeIdempotencyKey = `welcome-${inserted[0].id}-${inserted[0].subscribedAt.getTime()}`;
    }

    // Reconcile the contact before sending so an explicit re-subscription
    // clears provider-level suppression first. Awaiting this also prevents the
    // contact and email requests from competing for Resend's rate limit.
    const providerSync = await syncSubscriberToResend({
      email,
      name: name ?? existing[0]?.name ?? null,
      status: "active",
    });
    if (!providerSync.ok) {
      console.error("[subscribe] Resend contact sync failed:", providerSync.error);
    }

    // Send welcome email. Best-effort — a signup must never fail because the
    // email provider is having a bad day. But the OUTCOME is reported back, so
    // the UI can stop promising an inbox delivery that didn't happen.
    let emailed = false;
    const resend = getResend();
    const postalAddress = marketingPostalAddress();
    const marketingSenderConfigured = isMarketingSenderConfigured();
    const topicId = configuredMarketingTopicId();
    const marketingSendEnabled = isMarketingSendEnabled();
    if (
      resend &&
      postalAddress &&
      marketingSenderConfigured &&
      topicId &&
      marketingSendEnabled &&
      providerSync.ok
    ) {
      try {
        const unsubUrl = unsubscribeUrl(email);
        const wonByScratch = Boolean(won && issued.code === won.code);
        const html = await render(
          WelcomeEmail({
            name: name ?? undefined,
            code: issued.code,
            percentOff: issued.percentOff,
            wonByScratch,
            unsubscribeUrl: unsubUrl,
            postalAddress,
          }),
        );
        const text = `Welcome to Y2KASE!${name ? ` Hey ${name}!` : ""}\n\n${wonByScratch ? `You scratched your way to ${issued.percentOff}% off` : `Here is your ${issued.percentOff}% off code`} for your first order:\n\n${issued.code}\n\nEnter it at checkout at https://y2kase.com\n\nShop now: https://y2kase.com/products\n\n${postalAddress}\n\nUnsubscribe: ${unsubUrl}`;

        // The Resend SDK resolves rather than throws on an API error (a 403 for
        // an unverified sender, say), so the response has to be inspected —
        // awaiting it alone would report every rejected send as a success.
        const { error } = await resend.emails.send(
          {
            // Marketing: it carries List-Unsubscribe below, which is the test.
            from: senderFor("marketing"),
            replyTo: EMAIL_REPLY_TO,
            to: email,
            subject: `✨ Your ${issued.percentOff}% off code is here, bestie!`,
            topicId,
            html,
            text,
            // One-click unsubscribe (RFC 8058) — required for bulk senders and
            // a strong deliverability signal to Gmail/Yahoo.
            headers: listUnsubscribeHeaders(email),
          },
          {
            idempotencyKey:
              welcomeIdempotencyKey ?? `welcome-${Date.now().toString(36)}`,
          },
        );

        if (error) {
          console.error("[subscribe] Resend rejected the send:", error);
        } else {
          emailed = true;
          try {
            await recordMarketingSend({
              email,
              kind: "welcome",
              stepKey: "1",
            });
          } catch (logError) {
            console.error("[subscribe] welcome send log failed:", logError);
          }
        }
      } catch (emailErr) {
        console.error("[subscribe] email send failed:", emailErr);
      }
    } else if (!resend) {
      console.warn("[subscribe] RESEND_API_KEY not set; skipping welcome email.");
    } else if (!marketingSenderConfigured) {
      console.error(
        "[subscribe] EMAIL_FROM_MARKETING is required; refusing to use the transactional sender.",
      );
    } else if (!postalAddress) {
      console.error(
        "[subscribe] MARKETING_POSTAL_ADDRESS is required; skipping welcome email.",
      );
    } else if (!topicId) {
      console.error(
        "[subscribe] RESEND_MARKETING_TOPIC_ID is required; skipping welcome email.",
      );
    } else if (!marketingSendEnabled) {
      console.error(
        "[subscribe] MARKETING_SEND_ENABLED is false; skipping welcome email.",
      );
    } else {
      console.error(
        "[subscribe] Welcome email skipped because provider contact sync failed.",
      );
    }

    return NextResponse.json({
      ok: true,
      code: issued.code,
      percentOff: issued.percentOff,
      emailed,
      reactivated,
    });
  } catch (err) {
    console.error("[subscribe] error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}

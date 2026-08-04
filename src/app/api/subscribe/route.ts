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
import { eq } from "drizzle-orm";
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

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // Throttle to blunt automated signup spam against the email provider.
  const limited = enforceRateLimit(request, "subscribe", {
    limit: 5,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const body = await request.json();
    const email = (body.email ?? "").trim().toLowerCase();
    const name = (body.name ?? "").trim() || null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email." }, { status: 400 });
    }

    // The prize the server drew for this visitor, read back from its signed
    // cookie. Never from the body — that would let anyone name their own tier.
    const prize = decodeScratchCookie(request.cookies.get(SCRATCH_COOKIE)?.value);
    const won = prize ? prizeCoupon(prize) : null;
    const coupon = won ?? WELCOME_COUPON;

    // Check if already subscribed — don't re-send if already in DB.
    const existing = await db
      .select({
        id: emailSubscribers.id,
        status: emailSubscribers.status,
        discountCode: emailSubscribers.discountCode,
      })
      .from(emailSubscribers)
      .where(eq(emailSubscribers.email, email))
      .limit(1);

    if (existing.length > 0) {
      // Already signed up — hand back the code this address was originally
      // issued, not a freshly drawn one. Re-subscribing must not be a way to
      // shop for a better tier, and the shopper's existing welcome email
      // already names this code.
      const held = resolveLocalCoupon(existing[0].discountCode) ?? coupon;
      return NextResponse.json({
        ok: true,
        code: held.code,
        percentOff: held.percentOff,
        alreadySubscribed: true,
      });
    }

    // Insert subscriber.
    await db.insert(emailSubscribers).values({
      email,
      name,
      source: body.source ?? "popup",
      discountCode: coupon.code,
      status: "active",
    });

    // Send welcome email. Best-effort — a signup must never fail because the
    // email provider is having a bad day. But the OUTCOME is reported back, so
    // the UI can stop promising an inbox delivery that didn't happen.
    let emailed = false;
    const resend = getResend();
    if (resend) {
      try {
        const unsubUrl = unsubscribeUrl(email);
        const html = await render(
          WelcomeEmail({
            name: name ?? undefined,
            code: coupon.code,
            percentOff: coupon.percentOff,
            wonByScratch: Boolean(won),
            unsubscribeUrl: unsubUrl,
          }),
        );
        const text = `Welcome to Y2KASE!${name ? ` Hey ${name}!` : ""}\n\n${won ? `You scratched your way to ${coupon.percentOff}% off` : `Here is your ${coupon.percentOff}% off code`} for your first order:\n\n${coupon.code}\n\nEnter it at checkout at https://y2kase.com\n\nShop now: https://y2kase.com/products\n\nUnsubscribe: ${unsubUrl}`;

        // The Resend SDK resolves rather than throws on an API error (a 403 for
        // an unverified sender, say), so the response has to be inspected —
        // awaiting it alone would report every rejected send as a success.
        const { error } = await resend.emails.send({
          // Marketing: it carries List-Unsubscribe below, which is the test.
          from: senderFor("marketing"),
          replyTo: EMAIL_REPLY_TO,
          to: email,
          subject: `✨ Your ${coupon.percentOff}% off code is here, bestie!`,
          html,
          text,
          // One-click unsubscribe (RFC 8058) — required for bulk senders and
          // a strong deliverability signal to Gmail/Yahoo.
          headers: listUnsubscribeHeaders(email),
        });

        if (error) {
          console.error("[subscribe] Resend rejected the send:", error);
        } else {
          emailed = true;
        }
      } catch (emailErr) {
        console.error("[subscribe] email send failed:", emailErr);
      }
    } else {
      console.warn("[subscribe] RESEND_API_KEY not set; skipping welcome email.");
    }

    return NextResponse.json({
      ok: true,
      code: coupon.code,
      percentOff: coupon.percentOff,
      emailed,
    });
  } catch (err) {
    console.error("[subscribe] error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}

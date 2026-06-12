/**
 * POST /api/subscribe
 *
 * Accepts an email (and optional name) from the welcome pop-up or footer form.
 * - Upserts the subscriber in the DB (idempotent on email).
 * - Issues the WELCOME15 promo code.
 * - Sends a branded welcome email with the discount code.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailSubscribers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { render } from "@react-email/components";
import { WelcomeEmail } from "@/emails/WelcomeEmail";
import { enforceRateLimit } from "@/lib/rate-limit";
import { listUnsubscribeHeaders, unsubscribeUrl } from "@/lib/unsubscribe";

export const runtime = "nodejs";

const PROMO_CODE = "WELCOME15";

// Lazily construct the client so a missing key can't crash the module at import
// time (which would 500 the whole route instead of degrading gracefully).
let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

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

    // Check if already subscribed — don't re-send if already in DB.
    const existing = await db
      .select({ id: emailSubscribers.id, status: emailSubscribers.status })
      .from(emailSubscribers)
      .where(eq(emailSubscribers.email, email))
      .limit(1);

    if (existing.length > 0) {
      // Already signed up — return success without re-sending (idempotent).
      return NextResponse.json({
        ok: true,
        code: PROMO_CODE,
        alreadySubscribed: true,
      });
    }

    // Insert subscriber.
    await db.insert(emailSubscribers).values({
      email,
      name,
      source: body.source ?? "popup",
      discountCode: PROMO_CODE,
      status: "active",
    });

    // Send welcome email. Best-effort — never block the response on email.
    const resend = getResend();
    if (resend) {
      try {
        const unsubUrl = unsubscribeUrl(email);
        const html = await render(
          WelcomeEmail({ name: name ?? undefined, code: PROMO_CODE, unsubscribeUrl: unsubUrl }),
        );
        const text = `Welcome to Y2KASE!${name ? ` Hey ${name}!` : ""}\n\nHere is your 15% off code for your first order:\n\n${PROMO_CODE}\n\nEnter it at checkout at https://y2kase.com\n\nShop now: https://y2kase.com/products\n\nUnsubscribe: ${unsubUrl}`;

        await resend.emails.send({
          from: process.env.EMAIL_FROM ?? "Y2KASE <onboarding@resend.dev>",
          to: email,
          subject: "✨ Your 15% off code is here, bestie!",
          html,
          text,
          // One-click unsubscribe (RFC 8058) — required for bulk senders and
          // a strong deliverability signal to Gmail/Yahoo.
          headers: listUnsubscribeHeaders(email),
        });
      } catch (emailErr) {
        console.error("[subscribe] email send failed:", emailErr);
      }
    } else {
      console.warn("[subscribe] RESEND_API_KEY not set; skipping welcome email.");
    }

    return NextResponse.json({ ok: true, code: PROMO_CODE });
  } catch (err) {
    console.error("[subscribe] error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}

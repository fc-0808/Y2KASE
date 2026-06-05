/**
 * POST /api/subscribe
 *
 * Accepts an email (and optional name) from the welcome pop-up or footer form.
 * - Upserts the subscriber in the DB (idempotent on email).
 * - Issues the WELCOME10 promo code.
 * - Sends a branded welcome email with the discount code.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailSubscribers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { render } from "@react-email/components";
import { WelcomeEmail } from "@/emails/WelcomeEmail";

export const runtime = "nodejs";

const PROMO_CODE = "WELCOME10";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(request: NextRequest) {
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
    try {
      const html = await render(WelcomeEmail({ name: name ?? undefined, code: PROMO_CODE }));
      const text = `Welcome to Y2KASE!${name ? ` Hey ${name}!` : ""}\n\nHere is your 10% off code for your first order:\n\n${PROMO_CODE}\n\nEnter it at checkout at https://y2kase.com\n\nShop now: https://y2kase.com/products`;

      await resend.emails.send({
        from: process.env.EMAIL_FROM ?? "Y2KASE <onboarding@resend.dev>",
        to: email,
        subject: "✨ Your 10% off code is here, bestie!",
        html,
        text,
      });
    } catch (emailErr) {
      console.error("[subscribe] email send failed:", emailErr);
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

/**
 * POST /api/admin/inbox/reply
 *
 * Send a reply email via Resend from hello@y2kase.com.
 *
 * Body (JSON):
 *   to          — recipient email address
 *   subject     — email subject (auto-prefixed with "Re: " if needed)
 *   body        — plain-text reply body
 *   quotedText  — (optional) original message quoted below the reply
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { Resend } from "resend";
import { requireAdmin } from "@/lib/auth";

async function auth() {
  return requireAdmin(await headers());
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "Email not configured (RESEND_API_KEY missing)" },
      { status: 503 },
    );
  }

  const { to, subject, body, quotedText } = await req.json() as {
    to: string;
    subject: string;
    body: string;
    quotedText?: string;
  };

  if (!to || !body) {
    return NextResponse.json({ error: "Missing to or body" }, { status: 400 });
  }

  // Ensure subject has Re: prefix.
  const reSubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;

  // Build plain-text body with optional quoted original.
  const fullText = quotedText
    ? `${body}\n\n---\nOn ${new Date().toDateString()}, you wrote:\n${quotedText
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n")}`
    : body;

  // Build HTML version.
  const htmlBody = `
    <div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;max-width:600px">
      ${body.split("\n").map((l) => `<p style="margin:0 0 8px">${l || "&nbsp;"}</p>`).join("")}
      ${
        quotedText
          ? `<br/><hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
             <p style="color:#6b7280;font-size:12px">On ${new Date().toDateString()}, you wrote:</p>
             <blockquote style="border-left:3px solid #e5e7eb;margin:0;padding:0 0 0 12px;color:#6b7280;font-size:13px">
               ${quotedText.split("\n").map((l) => `<p style="margin:0 0 4px">${l || "&nbsp;"}</p>`).join("")}
             </blockquote>`
          : ""
      }
      <br/>
      <p style="color:#6b7280;font-size:13px;border-top:1px solid #f3f4f6;padding-top:12px;margin-top:16px">
        — Y2KASE Team · <a href="https://y2kase.com" style="color:#6366f1">y2kase.com</a>
      </p>
    </div>
  `;

  const resend = new Resend(process.env.RESEND_API_KEY);

  // Send from the configured sender; set Reply-To so customers reply back to hello@.
  const from = process.env.EMAIL_FROM ?? "Y2KASE <orders@y2kase.com>";

  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject: reSubject,
    text: fullText,
    html: htmlBody,
    replyTo: "hello@y2kase.com",
  });

  if (error) {
    console.error("[inbox/reply] Resend error:", error);
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * POST /api/admin/inbox/reply
 *
 * Send a reply via Namecheap Private Email SMTP (nodemailer).
 * Using the actual hello@y2kase.com SMTP account ensures the sent email
 * is saved to the Sent folder on privateemail.com automatically.
 *
 * Env vars used (reuse IMAP credentials — same server/account):
 *   IMAP_HOST  — mail.privateemail.com
 *   IMAP_USER  — hello@y2kase.com
 *   IMAP_PASS  — email password
 *
 * Body (JSON):
 *   to          — recipient email address
 *   subject     — email subject (auto-prefixed with "Re: " if needed)
 *   body        — plain-text reply body
 *   quotedText  — (optional) original message to quote below the reply
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import nodemailer from "nodemailer";
import { requireAdmin } from "@/lib/auth";

async function auth() {
  return requireAdmin(await headers());
}

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.IMAP_HOST ?? "mail.privateemail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.IMAP_USER ?? "",
      pass: process.env.IMAP_PASS ?? "",
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.IMAP_USER || !process.env.IMAP_PASS) {
    return NextResponse.json(
      { error: "SMTP not configured (IMAP_USER / IMAP_PASS missing)" },
      { status: 503 },
    );
  }

  const { to, subject, body, quotedText } = (await req.json()) as {
    to: string;
    subject: string;
    body: string;
    quotedText?: string;
  };

  if (!to || !body) {
    return NextResponse.json({ error: "Missing to or body" }, { status: 400 });
  }

  const reSubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;

  const plainText = quotedText
    ? `${body}\n\n---\nOn ${new Date().toDateString()}, you wrote:\n${quotedText
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n")}`
    : body;

  const htmlBody = `
    <div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;max-width:600px">
      ${body
        .split("\n")
        .map((l) => `<p style="margin:0 0 8px">${l || "&nbsp;"}</p>`)
        .join("")}
      ${
        quotedText
          ? `<br/>
             <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
             <p style="color:#6b7280;font-size:12px">On ${new Date().toDateString()}, you wrote:</p>
             <blockquote style="border-left:3px solid #e5e7eb;margin:0;padding:0 0 0 12px;color:#6b7280;font-size:13px">
               ${quotedText
                 .split("\n")
                 .map((l) => `<p style="margin:0 0 4px">${l || "&nbsp;"}</p>`)
                 .join("")}
             </blockquote>`
          : ""
      }
      <br/>
      <p style="color:#6b7280;font-size:13px;border-top:1px solid #f3f4f6;padding-top:12px;margin-top:16px">
        — Y2KASE Team &middot;
        <a href="https://y2kase.com" style="color:#6366f1">y2kase.com</a>
      </p>
    </div>
  `;

  const transport = getTransport();

  try {
    await transport.sendMail({
      from: `Y2KASE <${process.env.IMAP_USER}>`,
      to,
      subject: reSubject,
      text: plainText,
      html: htmlBody,
    });
  } catch (err) {
    console.error("[inbox/reply] SMTP error:", err);
    const msg = err instanceof Error ? err.message : "SMTP send failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

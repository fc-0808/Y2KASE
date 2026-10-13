/**
 * POST /api/admin/inbox/reply
 *
 * Send a reply via Namecheap Private Email SMTP (nodemailer), then APPEND
 * the same bytes to the Sent folder. SMTP only relays; it does not file a
 * copy, so the admin Sent view would miss these replies otherwise.
 *
 * Body is multipart form data:
 *   to, subject, body, quotedText (optional), images (repeatable files)
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import nodemailer from "nodemailer";
import { requireAdmin } from "@/lib/auth";
import { archiveSentCopy, isImapConfigured } from "@/lib/imap";
import {
  buildReplyRaw,
  isReplyRecipient,
  readReplyImages,
} from "@/lib/inbox/reply-message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

function field(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = process.env.IMAP_USER ?? "";
  if (!user || !process.env.IMAP_PASS || !isImapConfigured()) {
    return NextResponse.json(
      { error: "SMTP not configured (IMAP_USER / IMAP_PASS missing)" },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Could not read the reply." }, { status: 400 });
  }

  const to = field(form, "to").trim();
  const subject = field(form, "subject");
  const body = field(form, "body");
  const quotedText = field(form, "quotedText").trim();

  if (!isReplyRecipient(to)) {
    return NextResponse.json({ error: "That recipient address is not valid." }, { status: 400 });
  }

  const images = await readReplyImages(form.getAll("images"));
  if ("error" in images) {
    return NextResponse.json({ error: images.error }, { status: 400 });
  }
  if (!body.trim() && images.images.length === 0) {
    return NextResponse.json(
      { error: "Write a message or attach a photo." },
      { status: 400 },
    );
  }

  let raw: Buffer;
  try {
    const built = await buildReplyRaw({
      from: `Y2KASE <${user}>`,
      to,
      subject,
      body,
      quotedText: quotedText || undefined,
      images: images.images,
    });
    raw = built.raw;
  } catch (err) {
    console.error("[inbox/reply] could not build message", err);
    return NextResponse.json({ error: "Could not build the email." }, { status: 500 });
  }

  const transport = getTransport();
  try {
    await transport.sendMail({
      envelope: { from: user, to },
      raw,
    });
  } catch (err) {
    console.error("[inbox/reply] SMTP error:", err);
    const msg = err instanceof Error ? err.message : "SMTP send failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  let archived = true;
  try {
    await archiveSentCopy(raw);
  } catch (err) {
    archived = false;
    console.error("[inbox/reply] could not save Sent copy", err);
  }

  return NextResponse.json({ ok: true, archived });
}

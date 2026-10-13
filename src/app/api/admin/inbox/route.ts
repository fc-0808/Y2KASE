/**
 * GET  /api/admin/inbox?mailbox=inbox|sent
 *      /api/admin/inbox?uid=X&mailbox=inbox|sent
 * DELETE /api/admin/inbox?uid=X&mailbox=inbox|sent  — move to Trash
 * PATCH  /api/admin/inbox?uid=X&read=true|false&mailbox=inbox|sent
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  fetchEmails,
  fetchEmailDetail,
  deleteEmail,
  markEmail,
  isImapConfigured,
} from "@/lib/imap";
import {
  parseInboxMailbox,
  parseInboxUid,
  type InboxMailbox,
} from "@/lib/inbox/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function auth(req: NextRequest) {
  return requireAdmin(req.headers);
}

function mailboxOf(req: NextRequest): InboxMailbox {
  return parseInboxMailbox(req.nextUrl.searchParams.get("mailbox"));
}

function failure(err: unknown, mailbox: InboxMailbox) {
  if (
    err instanceof Error &&
    err.message === "Sent folder was not found on the mail server."
  ) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
  console.error("[inbox]", err);
  return NextResponse.json(
    {
      error:
        mailbox === "sent" ? "Could not load sent mail." : "Could not load inbox.",
    },
    { status: 502 },
  );
}

export async function GET(req: NextRequest) {
  const session = await auth(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isImapConfigured()) {
    return NextResponse.json(
      { error: "IMAP not configured. Set IMAP_USER and IMAP_PASS." },
      { status: 503 },
    );
  }

  const mailbox = mailboxOf(req);
  const uidParam = req.nextUrl.searchParams.get("uid");
  try {
    if (uidParam) {
      const uid = parseInboxUid(uidParam);
      if (!uid) {
        return NextResponse.json({ error: "Invalid uid" }, { status: 400 });
      }
      const email = await fetchEmailDetail(uid, mailbox);
      if (!email) {
        return NextResponse.json({ error: "Email not found" }, { status: 404 });
      }
      return NextResponse.json(email);
    }

    const emails = await fetchEmails(40, mailbox);
    return NextResponse.json(emails);
  } catch (err) {
    return failure(err, mailbox);
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uid = parseInboxUid(req.nextUrl.searchParams.get("uid"));
  if (!uid) {
    return NextResponse.json({ error: "Missing uid" }, { status: 400 });
  }

  await deleteEmail(uid, mailboxOf(req));
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const session = await auth(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uid = parseInboxUid(req.nextUrl.searchParams.get("uid"));
  const read = req.nextUrl.searchParams.get("read") !== "false";

  if (!uid) {
    return NextResponse.json({ error: "Missing uid" }, { status: 400 });
  }

  await markEmail(uid, read, mailboxOf(req));
  return NextResponse.json({ ok: true });
}

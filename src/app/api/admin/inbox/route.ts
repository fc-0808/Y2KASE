/**
 * GET  /api/admin/inbox          — list emails (query: ?uid=X for detail)
 * DELETE /api/admin/inbox?uid=X  — move to Trash
 * PATCH  /api/admin/inbox?uid=X&read=true|false — toggle \Seen flag
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
import { parseInboxUid } from "@/lib/inbox/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function auth(req: NextRequest) {
  return requireAdmin(req.headers);
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

  const uidParam = req.nextUrl.searchParams.get("uid");
  if (uidParam) {
    const uid = parseInboxUid(uidParam);
    if (!uid) {
      return NextResponse.json({ error: "Invalid uid" }, { status: 400 });
    }
    const email = await fetchEmailDetail(uid);
    if (!email) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }
    return NextResponse.json(email);
  }

  const emails = await fetchEmails(40);
  return NextResponse.json(emails);
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

  await deleteEmail(uid);
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

  await markEmail(uid, read);
  return NextResponse.json({ ok: true });
}

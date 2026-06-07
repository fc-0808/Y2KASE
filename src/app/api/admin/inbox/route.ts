/**
 * GET  /api/admin/inbox          — list emails (query: ?uid=X for detail)
 * DELETE /api/admin/inbox?uid=X  — move to Trash
 * PATCH  /api/admin/inbox?uid=X&read=true|false — toggle \Seen flag
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import {
  fetchEmails,
  fetchEmailDetail,
  deleteEmail,
  markEmail,
  isImapConfigured,
} from "@/lib/imap";

async function auth() {
  const session = await requireAdmin(await headers());
  return session;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isImapConfigured()) {
    return NextResponse.json(
      { error: "IMAP not configured. Set IMAP_USER and IMAP_PASS." },
      { status: 503 },
    );
  }

  const uid = req.nextUrl.searchParams.get("uid");

  if (uid) {
    const email = await fetchEmailDetail(Number(uid));
    if (!email) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }
    return NextResponse.json(email);
  }

  const emails = await fetchEmails(40);
  return NextResponse.json(emails);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uid = Number(req.nextUrl.searchParams.get("uid"));
  if (!uid) {
    return NextResponse.json({ error: "Missing uid" }, { status: 400 });
  }

  await deleteEmail(uid);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uid = Number(req.nextUrl.searchParams.get("uid"));
  const read = req.nextUrl.searchParams.get("read") !== "false";

  if (!uid) {
    return NextResponse.json({ error: "Missing uid" }, { status: 400 });
  }

  await markEmail(uid, read);
  return NextResponse.json({ ok: true });
}

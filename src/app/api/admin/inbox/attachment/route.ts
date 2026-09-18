/**
 * GET /api/admin/inbox/attachment?uid=X&id=a0[&download=1]
 *
 * Streams one MIME part from the hello@ inbox. Admin-only. Inline for
 * images so the message iframe / gallery can render them; `download=1`
 * forces a save dialog (used by the attachment strip).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { fetchEmailAttachment, isImapConfigured } from "@/lib/imap";
import {
  contentDispositionHeader,
  parseAttachmentId,
  parseInboxUid,
} from "@/lib/inbox/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await requireAdmin(req.headers);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isImapConfigured()) {
    return NextResponse.json(
      { error: "IMAP not configured. Set IMAP_USER and IMAP_PASS." },
      { status: 503 },
    );
  }

  const uid = parseInboxUid(req.nextUrl.searchParams.get("uid"));
  const id = parseAttachmentId(req.nextUrl.searchParams.get("id"));
  if (!uid || !id) {
    return NextResponse.json({ error: "Invalid attachment" }, { status: 400 });
  }

  const part = await fetchEmailAttachment(uid, id);
  if (!part) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const download = req.nextUrl.searchParams.get("download") === "1";
  const inline = part.isImage && !download;
  const body = Buffer.from(part.bytes);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": part.mimeType || "application/octet-stream",
      "Content-Length": String(body.byteLength),
      "Content-Disposition": contentDispositionHeader(
        part.filename,
        inline ? "inline" : "attachment",
      ),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=120, must-revalidate",
    },
  });
}

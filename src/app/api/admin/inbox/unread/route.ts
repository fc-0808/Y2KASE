import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getUnreadCount, isImapConfigured } from "@/lib/imap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Unread count only. The full inbox fetch stays on /api/admin/inbox. */
export async function GET(req: NextRequest) {
  const session = await requireAdmin(req.headers);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isImapConfigured()) {
    return NextResponse.json(
      { unread: 0, configured: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const unread = await getUnreadCount();
    return NextResponse.json(
      { unread, configured: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[today-desk] inbox", error);
    return NextResponse.json(
      { unread: 0, configured: true, error: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}

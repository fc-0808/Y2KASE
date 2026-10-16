import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getTodayDesk } from "@/lib/admin/today-desk-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await requireAdmin(req.headers);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const desk = await getTodayDesk();
  return NextResponse.json(desk, {
    headers: { "Cache-Control": "no-store" },
  });
}

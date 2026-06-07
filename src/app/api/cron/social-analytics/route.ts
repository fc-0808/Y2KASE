/**
 * GET /api/cron/social-analytics — refresh Pinterest pin metrics (Vercel Cron).
 *
 * Pulls impressions/saves/clicks for every published creative and caches them
 * on the row, so the Social Studio shows up-to-date performance without hitting
 * the Pinterest API on every page load. Bounded + sequential to respect rate
 * limits. Runs daily.
 *
 * Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { isDbConfigured } from "@/lib/db";
import { isPinterestConfigured } from "@/lib/social/pinterest";
import { refreshAllPinMetrics } from "@/lib/social/analytics";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, updated: 0, reason: "no-db" });
  }
  if (!isPinterestConfigured()) {
    return NextResponse.json({ ok: true, updated: 0, reason: "no-pinterest-token" });
  }

  const res = await refreshAllPinMetrics();
  return NextResponse.json({ ok: true, ...res });
}

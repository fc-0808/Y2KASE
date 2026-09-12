/**
 * GET /api/cron/pinterest-hygiene — slow follow drip (Vercel Cron).
 *
 * Follows a handful of curated niche accounts once per UTC day so the profile
 * does not sit at Following = 0 (broadcast-bot signal). Does not delete pins
 * and does not rewrite boards — those are one-shot admin/CLI actions.
 *
 * Opt-out: PINTEREST_FOLLOW_ENABLED="false".
 * Auth header: Vercel attaches `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { isDbConfigured } from "@/lib/db";
import { isPinterestConfigured } from "@/lib/social/pinterest";
import {
  isFollowDripEnabled,
  runFollowDrip,
} from "@/lib/social/pinterest-follow";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isFollowDripEnabled()) {
    return NextResponse.json({ ok: true, followed: 0, reason: "disabled" });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: true, followed: 0, reason: "no-db" });
  }
  if (!isPinterestConfigured()) {
    return NextResponse.json({
      ok: true,
      followed: 0,
      reason: "no-pinterest-token",
    });
  }

  const result = await runFollowDrip();
  return NextResponse.json({
    ok:
      result.reason === "ok" ||
      result.reason === "daily-cap" ||
      result.reason === "caught-up" ||
      result.reason === "disabled",
    followed: result.followed,
    skipped: result.skipped,
    remaining: result.remaining,
    followingCount: result.followingCount,
    reason: result.reason,
    message: result.message,
  });
}

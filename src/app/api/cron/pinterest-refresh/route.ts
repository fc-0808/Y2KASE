/**
 * /api/cron/pinterest-refresh — keep the Pinterest OAuth access token alive.
 *
 * Pinterest access tokens expire every ~30 days; refresh tokens ~60 days.
 * This cron runs **daily** and refreshes whenever the access token is expired
 * or within 7 days of expiry. Running daily (instead of every ~20 days) closes
 * the scheduling gap that previously let the token die while the refresh token
 * was still valid — which halted auto-pin with wall-to-wall 401s.
 *
 * Schedule: "0 6 * * *" — 06:00 UTC every day (see vercel.json).
 */

import { NextRequest, NextResponse } from "next/server";
import { refreshPinterestTokenIfDue } from "@/lib/social/pinterest-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  const authorization = req.headers.get("authorization");
  if (!expected || authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await refreshPinterestTokenIfDue();

  if (!result.ok) {
    const status =
      result.reason === "api-error" || result.reason === "unexpected"
        ? 502
        : 200;
    return NextResponse.json(
      {
        ok: false,
        reason: result.reason,
        message: result.message,
      },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    refreshed: result.refreshed,
    reason: result.reason,
    message: result.refreshed
      ? "Token refreshed."
      : "Access token still valid — no refresh needed.",
  });
}

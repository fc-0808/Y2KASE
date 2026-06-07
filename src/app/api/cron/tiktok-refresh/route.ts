/**
 * /api/cron/tiktok-refresh — rotate the TikTok OAuth access token.
 *
 * TikTok access tokens expire every 24 hours — far shorter than Pinterest's
 * 30 days. This cron runs daily to refresh the token before it lapses,
 * keeping the automated publishing pipeline alive without manual steps.
 *
 * Refresh tokens last 365 days; each refresh resets the access_token TTL
 * to 24h. If the refresh token also expires (rare), the admin must
 * reconnect via the "Connect TikTok" button in the Social Studio.
 *
 * Schedule: "0 5 * * *" — 5 AM UTC daily.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getToken,
  upsertToken,
  canRefresh,
  expiresWithin,
} from "@/lib/social/token-store";
import { refreshAccessToken } from "@/lib/social/tiktok";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await getToken("tiktok");
  if (!row) {
    return NextResponse.json({
      ok: false,
      reason: "no-token",
      message: "No TikTok token in DB. Connect via /admin/social first.",
    });
  }

  // TikTok tokens last 24h — refresh if expiring within 6h (generous buffer).
  if (!expiresWithin(row, 6 * 60 * 60 * 1000)) {
    return NextResponse.json({
      ok: true,
      reason: "not-due",
      message: "TikTok access token still valid — no refresh needed.",
    });
  }

  if (!canRefresh(row)) {
    return NextResponse.json({
      ok: false,
      reason: "no-refresh-token",
      message:
        "Refresh token missing or expired. Please reconnect TikTok at /admin/social.",
    });
  }

  try {
    const tokens = await refreshAccessToken(row.refreshToken!);

    await upsertToken("tiktok", {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      refreshExpiresIn: tokens.refresh_expires_in,
      scopes: tokens.scope ?? row.scopes ?? undefined,
      accountId: row.accountId ?? undefined,
      accountName: row.accountName ?? undefined,
    });

    console.info("[tiktok-refresh] Token rotated successfully.");
    return NextResponse.json({ ok: true, message: "TikTok token refreshed." });
  } catch (err) {
    console.error("[tiktok-refresh] Unexpected error:", err);
    return NextResponse.json(
      { ok: false, reason: "unexpected", message: String(err) },
      { status: 500 },
    );
  }
}

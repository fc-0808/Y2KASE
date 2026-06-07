/**
 * /api/cron/pinterest-refresh — auto-rotate the Pinterest OAuth token.
 *
 * Pinterest access tokens expire every 30 days. This cron runs every 20 days
 * to refresh the token before it expires, using the stored refresh token
 * (pinr_ prefix). Each refresh also returns a new refresh token, so the
 * pipeline stays alive indefinitely as long as it runs on schedule.
 *
 * Schedule: "0 6 * /20 * *" — daily at 6 AM UTC every 20 days.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getToken,
  upsertToken,
  canRefresh,
  expiresWithin,
} from "@/lib/social/token-store";

const APP_ID = process.env.PINTEREST_APP_ID ?? "";
const APP_SECRET = process.env.PINTEREST_APP_SECRET ?? "";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await getToken("pinterest");
  if (!row) {
    return NextResponse.json({
      ok: false,
      reason: "no-token",
      message: "No Pinterest token in DB. Connect via /admin/social first.",
    });
  }

  // Only refresh if the access token expires within 7 days.
  if (!expiresWithin(row, 7 * 24 * 60 * 60 * 1000)) {
    return NextResponse.json({
      ok: true,
      reason: "not-due",
      message: "Access token still valid — no refresh needed.",
    });
  }

  if (!canRefresh(row)) {
    return NextResponse.json({
      ok: false,
      reason: "no-refresh-token",
      message:
        "Refresh token missing or expired. Please reconnect Pinterest at /admin/social.",
    });
  }

  if (!APP_ID || !APP_SECRET) {
    return NextResponse.json({
      ok: false,
      reason: "not-configured",
      message: "PINTEREST_APP_ID / PINTEREST_APP_SECRET not set.",
    });
  }

  try {
    const credentials = Buffer.from(`${APP_ID}:${APP_SECRET}`).toString("base64");
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refreshToken!,
    });

    const res = await fetch("https://api.pinterest.com/v5/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[pinterest-refresh] Refresh failed:", text);
      return NextResponse.json(
        { ok: false, reason: "api-error", message: text },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      refresh_token_expires_in?: number;
      scope?: string;
    };

    await upsertToken("pinterest", {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? row.refreshToken,
      expiresIn: data.expires_in,
      refreshExpiresIn: data.refresh_token_expires_in,
      scopes: data.scope ?? row.scopes ?? undefined,
      accountId: row.accountId ?? undefined,
      accountName: row.accountName ?? undefined,
    });

    console.info("[pinterest-refresh] Token rotated successfully.");
    return NextResponse.json({ ok: true, message: "Token refreshed." });
  } catch (err) {
    console.error("[pinterest-refresh] Unexpected error:", err);
    return NextResponse.json(
      { ok: false, reason: "unexpected", message: String(err) },
      { status: 500 },
    );
  }
}

/**
 * TikTok OAuth callback — /api/auth/tiktok/callback
 *
 * After the admin clicks "Connect TikTok" and authorises the app on
 * TikTok's OAuth page, TikTok redirects here with ?code=XXX&state=XXX.
 * We exchange the code for access + refresh tokens, persist them to
 * social_tokens, then redirect back to the Social Studio.
 *
 * Access tokens expire every 24 hours; the /api/cron/tiktok-refresh cron
 * handles rotation so the pipeline stays live.
 */

import { NextRequest, NextResponse } from "next/server";
import { upsertToken } from "@/lib/social/token-store";
import { exchangeCode, getTikTokAccount } from "@/lib/social/tiktok";

const REDIRECT_URI =
  process.env.TIKTOK_REDIRECT_URI ??
  `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://y2kase.com"}/api/auth/tiktok/callback`;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    console.error("[tiktok-callback] OAuth error:", error, errorDescription);
    return NextResponse.redirect(
      new URL(
        `/admin/social?tiktok_error=${encodeURIComponent(error)}`,
        req.url,
      ),
    );
  }

  if (!code || state !== "y2kase-admin") {
    return NextResponse.redirect(
      new URL("/admin/social?tiktok_error=invalid_state", req.url),
    );
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    return NextResponse.redirect(
      new URL("/admin/social?tiktok_error=app_not_configured", req.url),
    );
  }

  try {
    const tokens = await exchangeCode(code, REDIRECT_URI);

    // Store tokens immediately so resolveToken() uses the new one for the
    // account lookup below.
    await upsertToken("tiktok", {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      refreshExpiresIn: tokens.refresh_expires_in,
      scopes: tokens.scope,
      accountId: tokens.open_id,
    });

    // Enrich with display name (best-effort).
    try {
      const account = await getTikTokAccount();
      await upsertToken("tiktok", {
        accessToken: tokens.access_token,
        accountId: account.openId,
        accountName: account.displayName,
      });
      console.info("[tiktok-callback] Token stored for", account.displayName);
    } catch {
      console.info("[tiktok-callback] Token stored (account lookup skipped).");
    }

    return NextResponse.redirect(
      new URL("/admin/social?tiktok_connected=1", req.url),
    );
  } catch (err) {
    console.error("[tiktok-callback] Unexpected error:", err);
    return NextResponse.redirect(
      new URL("/admin/social?tiktok_error=unexpected", req.url),
    );
  }
}

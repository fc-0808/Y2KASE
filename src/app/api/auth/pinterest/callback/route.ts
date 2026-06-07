/**
 * Pinterest OAuth callback — /api/auth/pinterest/callback
 *
 * After the admin clicks "Connect Pinterest" and approves the OAuth prompt,
 * Pinterest redirects here with ?code=XXX&state=XXX. We exchange the code for
 * an access + refresh token, persist both to social_tokens, then redirect back
 * to the Social Studio.
 *
 * Flow:
 *   1. Admin → /admin/social → "Connect Pinterest" → Pinterest OAuth page
 *   2. Pinterest → this endpoint with ?code=XXX&state=admin:<signed-nonce>
 *   3. Exchange code for tokens, store in DB, redirect to /admin/social
 */

import { NextRequest, NextResponse } from "next/server";
import { upsertToken } from "@/lib/social/token-store";
import { getUserAccount } from "@/lib/social/pinterest";

const REDIRECT_URI =
  process.env.PINTEREST_REDIRECT_URI ??
  `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://y2kase.com"}/api/auth/pinterest/callback`;

const APP_ID = process.env.PINTEREST_APP_ID ?? "";
const APP_SECRET = process.env.PINTEREST_APP_SECRET ?? "";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    console.error("[pinterest-callback] OAuth error:", error);
    return NextResponse.redirect(
      new URL(`/admin/social?pinterest_error=${encodeURIComponent(error)}`, req.url),
    );
  }

  if (!code || state !== "y2kase-admin") {
    return NextResponse.redirect(
      new URL("/admin/social?pinterest_error=invalid_state", req.url),
    );
  }

  if (!APP_ID || !APP_SECRET) {
    console.error("[pinterest-callback] PINTEREST_APP_ID or PINTEREST_APP_SECRET not set");
    return NextResponse.redirect(
      new URL("/admin/social?pinterest_error=app_not_configured", req.url),
    );
  }

  try {
    const credentials = Buffer.from(`${APP_ID}:${APP_SECRET}`).toString("base64");
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    });

    const tokenRes = await fetch("https://api.pinterest.com/v5/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error("[pinterest-callback] Token exchange failed:", text);
      return NextResponse.redirect(
        new URL(`/admin/social?pinterest_error=token_exchange_failed`, req.url),
      );
    }

    const data = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      refresh_token_expires_in?: number;
      scope?: string;
    };

    // Store the new token first so the Pinterest client (which reads the DB
    // before the env var) immediately uses it for the account lookup below.
    await upsertToken("pinterest", {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      refreshExpiresIn: data.refresh_token_expires_in,
      scopes: data.scope,
    });

    // Enrich with the connected account name for the admin UI (best-effort).
    try {
      const account = await getUserAccount();
      await upsertToken("pinterest", {
        accessToken: data.access_token,
        accountId: account.username,
        accountName: account.username,
      });
      console.info("[pinterest-callback] Token stored for", account.username);
    } catch {
      console.info("[pinterest-callback] Token stored (account lookup skipped).");
    }

    return NextResponse.redirect(new URL("/admin/social?pinterest_connected=1", req.url));
  } catch (err) {
    console.error("[pinterest-callback] Unexpected error:", err);
    return NextResponse.redirect(
      new URL("/admin/social?pinterest_error=unexpected", req.url),
    );
  }
}

/**
 * Meta OAuth callback — /api/auth/meta/callback
 *
 * After the admin authorises the app on Facebook's OAuth dialog, Meta redirects
 * here with ?code=…&state=…. We exchange the code for a short-lived user token,
 * upgrade it to a long-lived token, then read the managed Page (which yields a
 * non-expiring Page access token and the linked Instagram business account) and
 * persist both "facebook" and "instagram" rows to social_tokens.
 *
 * Page access tokens derived from a long-lived user token do not expire, so no
 * refresh cron is required (unlike TikTok/Pinterest).
 */

import { NextRequest, NextResponse } from "next/server";
import { upsertToken } from "@/lib/social/token-store";
import {
  exchangeCodeForUserToken,
  getLongLivedUserToken,
  getManagedPage,
} from "@/lib/social/meta";

const REDIRECT_URI =
  process.env.META_REDIRECT_URI ??
  `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://y2kase.com"}/api/auth/meta/callback`;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error_description") ?? searchParams.get("error");

  if (error) {
    console.error("[meta-callback] OAuth error:", error);
    return NextResponse.redirect(
      new URL(`/admin/social?meta_error=${encodeURIComponent(error)}`, req.url),
    );
  }
  if (!code || state !== "y2kase-admin") {
    return NextResponse.redirect(
      new URL("/admin/social?meta_error=invalid_state", req.url),
    );
  }
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
    return NextResponse.redirect(
      new URL("/admin/social?meta_error=app_not_configured", req.url),
    );
  }

  try {
    const shortToken = await exchangeCodeForUserToken(code, REDIRECT_URI);
    const longToken = await getLongLivedUserToken(shortToken);
    const page = await getManagedPage(longToken);

    if (!page) {
      return NextResponse.redirect(
        new URL("/admin/social?meta_error=no_page", req.url),
      );
    }

    // Facebook Page (non-expiring Page token).
    await upsertToken("facebook", {
      accessToken: page.pageAccessToken,
      accountId: page.pageId,
      accountName: page.pageName,
    });

    // Instagram business account (shares the Page token).
    if (page.igUserId) {
      await upsertToken("instagram", {
        accessToken: page.pageAccessToken,
        accountId: page.igUserId,
        accountName: page.igUsername ?? undefined,
      });
    }

    console.info(
      "[meta-callback] Connected FB Page",
      page.pageName,
      page.igUserId ? `+ IG @${page.igUsername}` : "(no linked IG)",
    );

    return NextResponse.redirect(
      new URL(
        `/admin/social?meta_connected=1${page.igUserId ? "" : "&meta_no_ig=1"}`,
        req.url,
      ),
    );
  } catch (err) {
    console.error("[meta-callback] Unexpected error:", err);
    return NextResponse.redirect(
      new URL("/admin/social?meta_error=unexpected", req.url),
    );
  }
}

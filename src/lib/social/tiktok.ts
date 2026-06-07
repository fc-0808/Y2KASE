/**
 * TikTok Content Posting API v2 client.
 *
 * TikTok is a video-first platform — we post the product demo videos
 * (already on R2) using the PULL_FROM_URL method, which lets TikTok's
 * servers download the video directly (no chunked upload from our side,
 * and no Vercel timeout risk).
 *
 * Requires domain verification of https://y2kase.com in the TikTok Developer
 * portal so TikTok will accept our /api/video/:productId proxy URLs as a
 * trusted source. Once verified once, all product videos work automatically.
 *
 * Token notes:
 *   - Access tokens expire every 24 hours (much shorter than Pinterest's 30d).
 *   - Refresh tokens expire after 365 days.
 *   - The /api/cron/tiktok-refresh cron runs daily to rotate the token.
 *
 * UX compliance: TikTok requires querying creator_info before each publish
 * to get the allowed privacy_level_options for the account. We must present
 * these options — not hardcode them. For single-brand admin use, we fetch
 * them in the "Publish" action and store the result in the creative row.
 *
 * Docs: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
 */

import { getToken } from "@/lib/social/token-store";

const API_BASE = "https://open.tiktokapis.com/v2";

export function isTikTokConfigured(): boolean {
  return Boolean(
    process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET,
  );
}

export class TikTokError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code = "") {
    super(message);
    this.name = "TikTokError";
    this.status = status;
    this.code = code;
  }
}

/** Resolve the best available TikTok access token (DB first, env fallback). */
async function resolveToken(): Promise<string> {
  try {
    const row = await getToken("tiktok");
    if (row?.accessToken) return row.accessToken;
  } catch {
    // DB unavailable — fall through
  }
  const env = process.env.TIKTOK_ACCESS_TOKEN;
  if (!env) throw new TikTokError("TIKTOK_ACCESS_TOKEN is not set.", 401);
  return env;
}

async function tiktokFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await resolveToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    // keep empty
  }
  // TikTok wraps errors in json.error.code / json.error.message
  const err = json.error as Record<string, unknown> | undefined;
  if (!res.ok || (err && err.code !== "ok")) {
    const msg =
      (err?.message as string) ?? `TikTok API ${res.status}: ${text}`;
    throw new TikTokError(msg, res.status, (err?.code as string) ?? "");
  }
  return (json.data as T) ?? ({} as T);
}

// ─────────────────────────────────────────────────────────────────────────────
// Account / creator info
// ─────────────────────────────────────────────────────────────────────────────

export type TikTokAccount = {
  openId: string;
  displayName: string;
  avatarUrl: string;
};

/** Fetch the authenticated account info (for admin connection-status display). */
export async function getTikTokAccount(): Promise<TikTokAccount> {
  const data = await tiktokFetch<{
    user: { open_id: string; display_name: string; avatar_url: string };
  }>("/user/info/?fields=display_name,avatar_url");
  return {
    openId: data.user.open_id,
    displayName: data.user.display_name,
    avatarUrl: data.user.avatar_url,
  };
}

export type CreatorInfo = {
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoDurationSec: number;
};

/**
 * Query creator capabilities before each publish. TikTok requires that
 * privacy_level is chosen from the options returned here — it cannot be
 * hardcoded. For a single brand account this is called once per publish.
 */
export async function getCreatorInfo(): Promise<CreatorInfo> {
  const data = await tiktokFetch<{
    creator_avatar_url: string;
    creator_username: string;
    creator_nickname: string;
    privacy_level_options: string[];
    comment_disabled: boolean;
    duet_disabled: boolean;
    stitch_disabled: boolean;
    max_video_post_duration_sec: number;
  }>("/post/publish/creator_info/query/");
  return {
    privacyLevelOptions: data.privacy_level_options ?? ["PUBLIC_TO_EVERYONE"],
    commentDisabled: data.comment_disabled ?? false,
    duetDisabled: data.duet_disabled ?? false,
    stitchDisabled: data.stitch_disabled ?? false,
    maxVideoDurationSec: data.max_video_post_duration_sec ?? 600,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Video publishing
// ─────────────────────────────────────────────────────────────────────────────

export type PostVideoInput = {
  /** Public HTTPS URL TikTok will pull the video from. Must be on a
   *  domain verified in the TikTok Developer Portal — use the
   *  /api/video/:productId proxy on y2kase.com. */
  videoUrl: string;
  title: string;
  /** From creator_info.privacyLevelOptions — MUST not be hardcoded. */
  privacyLevel: string;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
};

export type PostVideoResult = {
  publishId: string;
};

/**
 * Initialise a Direct Post using PULL_FROM_URL.
 * TikTok's servers download the video; we don't need to upload chunks.
 * Returns a publish_id to poll for status.
 */
export async function postVideo(
  input: PostVideoInput,
): Promise<PostVideoResult> {
  const body = {
    post_info: {
      title: input.title.slice(0, 150),
      privacy_level: input.privacyLevel,
      disable_comment: input.disableComment ?? false,
      disable_duet: input.disableDuet ?? false,
      disable_stitch: input.disableStitch ?? false,
    },
    source_info: {
      source: "PULL_FROM_URL",
      video_url: input.videoUrl,
    },
  };

  const data = await tiktokFetch<{ publish_id: string }>(
    "/post/publish/video/init/",
    { method: "POST", body: JSON.stringify(body) },
  );
  return { publishId: data.publish_id };
}

export type PublishStatus =
  | "PROCESSING_UPLOAD"
  | "PROCESSING_DOWNLOAD"
  | "SEND_TO_USER_INBOX"
  | "PUBLISH_COMPLETE"
  | "FAILED";

export type PostStatusResult = {
  status: PublishStatus;
  publishId: string;
  /** Filled when status=PUBLISH_COMPLETE */
  postId?: string;
};

/** Poll the status of a pending publish. */
export async function getPublishStatus(
  publishId: string,
): Promise<PostStatusResult> {
  const data = await tiktokFetch<{
    process_type: string;
    stage: string;
    status: PublishStatus;
    published_post_id?: string;
  }>("/post/publish/status/fetch/", {
    method: "POST",
    body: JSON.stringify({ publish_id: publishId }),
  });
  return {
    status: data.status,
    publishId,
    postId: data.published_post_id,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth token exchange + refresh
// ─────────────────────────────────────────────────────────────────────────────

export type TikTokTokenResponse = {
  access_token: string;
  refresh_token: string;
  open_id: string;
  scope: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
};

const TOKEN_ENDPOINT = "https://open.tiktokapis.com/v2/oauth/token/";

function basicAuth(): string {
  const key = process.env.TIKTOK_CLIENT_KEY ?? "";
  const secret = process.env.TIKTOK_CLIENT_SECRET ?? "";
  return Buffer.from(`${key}:${secret}`).toString("base64");
}

/** Exchange an auth code for access + refresh tokens. */
export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<TikTokTokenResponse> {
  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY ?? "",
    client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "",
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: body.toString(),
  });
  const data = await res.json() as TikTokTokenResponse & { error?: string; error_description?: string };
  if (!res.ok || data.error) {
    throw new TikTokError(
      data.error_description ?? `Token exchange failed (${res.status})`,
      res.status,
    );
  }
  return data;
}

/** Refresh an expired access token. TikTok access tokens expire in 24h. */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<TikTokTokenResponse> {
  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY ?? "",
    client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: body.toString(),
  });
  const data = await res.json() as TikTokTokenResponse & { error?: string; error_description?: string };
  if (!res.ok || data.error) {
    throw new TikTokError(
      data.error_description ?? `Token refresh failed (${res.status})`,
      res.status,
    );
  }
  return data;
}

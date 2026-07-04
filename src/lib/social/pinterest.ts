/**
 * Pinterest API v5 client — programmatic publishing for the Social Studio.
 *
 * Token resolution order:
 *   1. social_tokens DB table (updated by OAuth callback + refresh cron).
 *   2. PINTEREST_ACCESS_TOKEN env var (manual bootstrap fallback).
 *
 * The DB-backed token is preferred because it auto-rotates every ~20 days
 * via /api/cron/pinterest-refresh, keeping the pipeline alive indefinitely.
 *
 * Docs: https://developers.pinterest.com/docs/api/v5/pins-create/
 *
 * Note: image_url passed to createPin must be a publicly reachable HTTPS URL —
 * our creatives live on the public R2 bucket, so they qualify.
 */

import { getToken } from "@/lib/social/token-store";

const API_BASE =
  process.env.PINTEREST_API_BASE?.replace(/\/$/, "") ??
  "https://api.pinterest.com/v5";

export function isPinterestConfigured(): boolean {
  return Boolean(process.env.PINTEREST_ACCESS_TOKEN);
}

/** Resolve the best available access token. DB row wins over env var. */
async function resolveToken(): Promise<string> {
  try {
    const row = await getToken("pinterest");
    if (row?.accessToken) return row.accessToken;
  } catch {
    // DB not available — fall through to env var
  }
  const env = process.env.PINTEREST_ACCESS_TOKEN;
  if (!env) throw new Error("PINTEREST_ACCESS_TOKEN is not set.");
  return env;
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await resolveToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export class PinterestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PinterestError";
    this.status = status;
  }
}

async function pinterestFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...(await authHeaders()), ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      const json = JSON.parse(text);
      message = json.message ?? json.error ?? text;
    } catch {
      // keep raw text
    }
    throw new PinterestError(
      `Pinterest API ${res.status}: ${message}`,
      res.status,
    );
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export type PinterestBoard = {
  id: string;
  name: string;
  privacy?: string;
};

/** List the authenticated account's boards (for the publish target picker). */
export async function listBoards(): Promise<PinterestBoard[]> {
  const data = await pinterestFetch<{
    items: { id: string; name: string; privacy?: string }[];
  }>("/boards?page_size=100");
  return (data.items ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    privacy: b.privacy,
  }));
}

export type PinterestAccount = {
  username: string;
  accountType?: string;
  profileImage?: string;
  websiteUrl?: string;
};

/** Fetch the connected account (for the admin connection-status panel). */
export async function getUserAccount(): Promise<PinterestAccount> {
  const data = await pinterestFetch<{
    username: string;
    account_type?: string;
    profile_image?: string;
    website_url?: string;
  }>("/user_account");
  return {
    username: data.username,
    accountType: data.account_type,
    profileImage: data.profile_image,
    websiteUrl: data.website_url,
  };
}

export type PinMetrics = {
  impressions: number;
  saves: number;
  pinClicks: number;
  outboundClicks: number;
};

/**
 * Fetch lifetime-ish analytics for a single pin. Pinterest requires a date
 * range (max 90 days) and a metric_types list. We sum daily values to a total.
 * Returns zeros (not an error) when no data is available yet — new pins take a
 * day or two to accrue measurable metrics.
 */
export async function getPinAnalytics(pinId: string): Promise<PinMetrics> {
  const end = new Date();
  const start = new Date(end.getTime() - 89 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10); // YYYY-MM-DD

  const params = new URLSearchParams({
    start_date: fmt(start),
    end_date: fmt(end),
    metric_types: "IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK",
  });

  const data = await pinterestFetch<{
    all?: {
      summary_metrics?: Record<string, number>;
      daily_metrics?: { metrics?: Record<string, number> }[];
    };
  }>(`/pins/${pinId}/analytics?${params.toString()}`);

  const summary = data.all?.summary_metrics;
  if (summary) {
    return {
      impressions: Math.round(summary.IMPRESSION ?? 0),
      saves: Math.round(summary.SAVE ?? 0),
      pinClicks: Math.round(summary.PIN_CLICK ?? 0),
      outboundClicks: Math.round(summary.OUTBOUND_CLICK ?? 0),
    };
  }

  // Fall back to summing daily metrics when no summary block is present.
  const totals: PinMetrics = {
    impressions: 0,
    saves: 0,
    pinClicks: 0,
    outboundClicks: 0,
  };
  for (const day of data.all?.daily_metrics ?? []) {
    const m = day.metrics ?? {};
    totals.impressions += m.IMPRESSION ?? 0;
    totals.saves += m.SAVE ?? 0;
    totals.pinClicks += m.PIN_CLICK ?? 0;
    totals.outboundClicks += m.OUTBOUND_CLICK ?? 0;
  }
  return {
    impressions: Math.round(totals.impressions),
    saves: Math.round(totals.saves),
    pinClicks: Math.round(totals.pinClicks),
    outboundClicks: Math.round(totals.outboundClicks),
  };
}

export type CreatePinInput = {
  boardId: string;
  imageUrl: string;
  title?: string;
  description?: string;
  /** Destination link — drive Pinterest traffic to the product page. */
  link?: string;
  altText?: string;
};

export type CreatedPin = {
  id: string;
  url: string;
};

/** Create a Pin from a public image URL. Returns the pin id + canonical URL. */
export async function createPin(input: CreatePinInput): Promise<CreatedPin> {
  const body = {
    board_id: input.boardId,
    ...(input.title ? { title: input.title.slice(0, 100) } : {}),
    ...(input.description
      ? { description: input.description.slice(0, 800) }
      : {}),
    ...(input.link ? { link: input.link } : {}),
    ...(input.altText ? { alt_text: input.altText.slice(0, 500) } : {}),
    media_source: {
      source_type: "image_url",
      url: input.imageUrl,
    },
  };

  const data = await pinterestFetch<{ id: string }>("/pins", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return {
    id: data.id,
    url: `https://www.pinterest.com/pin/${data.id}/`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Video Pins (Pinterest API v5 media upload flow)
// ─────────────────────────────────────────────────────────────────────────────
//
// Unlike image pins (which accept a URL directly), video pins are a 4-step flow:
//   1. Register the upload: POST /media { media_type: "video" } → media_id +
//      a pre-signed S3 upload_url + ordered upload_parameters.
//   2. Upload the video bytes to that S3 bucket as multipart/form-data (the
//      upload_parameters first, in order, then the `file` field). No auth here.
//   3. Poll GET /media/{media_id} until status === "succeeded".
//   4. Create the pin: POST /pins with media_source.source_type = "video_id".
//      NOTE: cover_image_url is *mandatory* for video pins — omitting it makes
//      the API return a misleading 401 (a documented Pinterest quirk).

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type RegisteredMedia = {
  mediaId: string;
  uploadUrl: string;
  uploadParameters: Record<string, string>;
};

async function registerVideoMedia(): Promise<RegisteredMedia> {
  const data = await pinterestFetch<{
    media_id: string;
    upload_url: string;
    upload_parameters: Record<string, string>;
  }>("/media", {
    method: "POST",
    body: JSON.stringify({ media_type: "video" }),
  });
  return {
    mediaId: data.media_id,
    uploadUrl: data.upload_url,
    uploadParameters: data.upload_parameters ?? {},
  };
}

/**
 * Stream the R2-hosted video into Pinterest's S3 bucket. The upload_parameters
 * must be appended first, in the exact order Pinterest returned them, followed
 * by the `file` field — S3's POST policy is order-sensitive.
 */
async function uploadVideoToBucket(
  reg: RegisteredMedia,
  videoUrl: string,
): Promise<void> {
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) {
    throw new PinterestError(
      `Could not fetch source video (${videoRes.status}) from ${videoUrl}`,
      videoRes.status,
    );
  }
  const blob = await videoRes.blob();

  const form = new FormData();
  for (const [key, value] of Object.entries(reg.uploadParameters)) {
    form.append(key, value);
  }
  form.append("file", blob, "video.mp4");

  const up = await fetch(reg.uploadUrl, { method: "POST", body: form });
  // S3 returns 204 No Content on success.
  if (!up.ok && up.status !== 204) {
    const text = await up.text().catch(() => "");
    throw new PinterestError(
      `Video upload to Pinterest storage failed (${up.status}): ${text.slice(0, 300)}`,
      up.status,
    );
  }
}

async function waitForMediaProcessing(
  mediaId: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 150_000;
  const intervalMs = opts.intervalMs ?? 4_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const data = await pinterestFetch<{ status: string }>(`/media/${mediaId}`);
    const status = data.status?.toLowerCase();
    if (status === "succeeded") return;
    if (status === "failed") {
      throw new PinterestError("Pinterest failed to process the video.", 502);
    }
    await sleep(intervalMs);
  }
  throw new PinterestError(
    "Timed out waiting for Pinterest to process the video.",
    504,
  );
}

export type CreateVideoPinInput = {
  boardId: string;
  /** Public HTTPS URL of the source video (R2). */
  videoUrl: string;
  /** Public HTTPS URL of the cover image — REQUIRED by Pinterest for video pins. */
  coverImageUrl: string;
  title?: string;
  description?: string;
  link?: string;
  altText?: string;
};

/** Create a video Pin: register → upload → wait → create. */
export async function createVideoPin(
  input: CreateVideoPinInput,
): Promise<CreatedPin> {
  if (!input.coverImageUrl) {
    throw new PinterestError(
      "A cover image is required to publish a video pin.",
      400,
    );
  }

  const reg = await registerVideoMedia();
  await uploadVideoToBucket(reg, input.videoUrl);
  await waitForMediaProcessing(reg.mediaId);

  const body = {
    board_id: input.boardId,
    ...(input.title ? { title: input.title.slice(0, 100) } : {}),
    ...(input.description
      ? { description: input.description.slice(0, 800) }
      : {}),
    ...(input.link ? { link: input.link } : {}),
    ...(input.altText ? { alt_text: input.altText.slice(0, 500) } : {}),
    media_source: {
      source_type: "video_id",
      media_id: reg.mediaId,
      cover_image_url: input.coverImageUrl,
    },
  };

  const data = await pinterestFetch<{ id: string }>("/pins", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return {
    id: data.id,
    url: `https://www.pinterest.com/pin/${data.id}/`,
  };
}

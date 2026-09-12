/**
 * Pinterest API v5 client — programmatic publishing for the Social Studio.
 *
 * Token resolution:
 *   1. Ensure a valid DB token (refresh proactively when expired / near expiry).
 *   2. Fall back to PINTEREST_ACCESS_TOKEN env var.
 *   3. On HTTP 401, force one refresh + retry so a just-expired token never
 *      permanently poisons an auto-pin run.
 *
 * Daily rotation lives in /api/cron/pinterest-refresh; this client is the
 * last line of defence when that cron misses a window.
 *
 * Docs: https://developers.pinterest.com/docs/api/v5/pins-create/
 *
 * Note: image_url passed to createPin must be a publicly reachable HTTPS URL —
 * our creatives live on the public R2 bucket, so they qualify.
 */

import sharp from "sharp";
import { getToken } from "@/lib/social/token-store";
import { ensurePinterestAccessToken } from "@/lib/social/pinterest-auth";

const API_BASE =
  process.env.PINTEREST_API_BASE?.replace(/\/$/, "") ??
  "https://api.pinterest.com/v5";

/** True when a DB token or env bootstrap token is present (not necessarily valid). */
export function isPinterestConfigured(): boolean {
  return Boolean(process.env.PINTEREST_ACCESS_TOKEN);
}

/** Async: true when we can obtain a usable access token (refreshing if needed). */
export async function isPinterestReady(): Promise<boolean> {
  if (!isPinterestConfigured()) {
    // OAuth-only setups store the token in DB without the env bootstrap var.
    try {
      const row = await getToken("pinterest");
      if (!row?.accessToken) return false;
    } catch {
      return false;
    }
  }
  const ensured = await ensurePinterestAccessToken();
  return ensured.ok;
}

/** Resolve a usable access token, refreshing the DB row when due. */
async function resolveToken(opts: { forceRefresh?: boolean } = {}): Promise<string> {
  const ensured = await ensurePinterestAccessToken({ force: opts.forceRefresh });
  if (ensured.ok && ensured.accessToken) return ensured.accessToken;
  throw new PinterestError(
    ensured.ok === false
      ? ensured.message
      : "Pinterest access token is not available.",
    401,
  );
}

async function authHeaders(
  opts: { forceRefresh?: boolean } = {},
): Promise<HeadersInit> {
  const token = await resolveToken(opts);
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
  opts: { retried?: boolean } = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(await authHeaders({ forceRefresh: opts.retried })),
      ...(init?.headers ?? {}),
    },
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

    // One forced refresh + retry on auth failure — covers the gap between
    // token expiry and the next daily refresh cron.
    if (res.status === 401 && !opts.retried) {
      const refreshed = await ensurePinterestAccessToken({ force: true });
      if (refreshed.ok) {
        return pinterestFetch<T>(path, init, { retried: true });
      }
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
  description?: string | null;
  pinCount?: number;
};

type PinterestPage<T> = {
  items?: T[];
  bookmark?: string | null;
};

async function paginate<T>(
  pathWithQuery: string,
  opts: { maxPages?: number } = {},
): Promise<T[]> {
  const maxPages = opts.maxPages ?? 10;
  const out: T[] = [];
  let bookmark: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const joiner = pathWithQuery.includes("?") ? "&" : "?";
    const path: string = bookmark
      ? `${pathWithQuery}${joiner}bookmark=${encodeURIComponent(bookmark)}`
      : pathWithQuery;
    const data: PinterestPage<T> = await pinterestFetch<PinterestPage<T>>(path);
    out.push(...(data.items ?? []));
    bookmark = data.bookmark ?? null;
    if (!bookmark) break;
  }
  return out;
}

/** List the authenticated account's boards (for the publish target picker). */
export async function listBoards(): Promise<PinterestBoard[]> {
  const items = await paginate<{
    id: string;
    name: string;
    privacy?: string;
    description?: string | null;
    pin_count?: number;
  }>("/boards?page_size=100", { maxPages: 5 });
  return items.map((b) => ({
    id: b.id,
    name: b.name,
    privacy: b.privacy,
    description: b.description ?? null,
    pinCount: b.pin_count,
  }));
}

export async function updateBoard(
  boardId: string,
  patch: { name?: string; description?: string },
): Promise<PinterestBoard> {
  const data = await pinterestFetch<{
    id: string;
    name: string;
    privacy?: string;
    description?: string | null;
    pin_count?: number;
  }>(`/boards/${encodeURIComponent(boardId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(patch.name ? { name: patch.name } : {}),
      ...(patch.description != null ? { description: patch.description } : {}),
    }),
  });
  return {
    id: data.id,
    name: data.name,
    privacy: data.privacy,
    description: data.description ?? null,
    pinCount: data.pin_count,
  };
}

export async function createBoard(input: {
  name: string;
  description: string;
  privacy?: "PUBLIC" | "PROTECTED" | "SECRET";
}): Promise<PinterestBoard> {
  const data = await pinterestFetch<{
    id: string;
    name: string;
    privacy?: string;
    description?: string | null;
    pin_count?: number;
  }>("/boards", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      privacy: input.privacy ?? "PUBLIC",
    }),
  });
  return {
    id: data.id,
    name: data.name,
    privacy: data.privacy,
    description: data.description ?? null,
    pinCount: data.pin_count,
  };
}

export type ListedPin = {
  id: string;
  createdAt: string | null;
  link: string | null;
  title: string | null;
  creativeType: string | null;
  isOwner: boolean;
  isVideo: boolean;
  impressions: number;
  saves: number;
  outbound: number;
};

function numMetric(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function metricsFromBucket(
  bucket: Record<string, unknown> | undefined,
): { impressions: number; saves: number; outbound: number } | null {
  if (!bucket) return null;
  const impressions = numMetric(bucket.impression ?? bucket.IMPRESSION);
  const saves = numMetric(bucket.save ?? bucket.SAVE);
  const outbound = numMetric(
    bucket.clickthrough ??
      bucket.CLICKTHROUGH ??
      bucket.outbound_click ??
      bucket.OUTBOUND_CLICK,
  );
  if (impressions === 0 && saves === 0 && outbound === 0) {
    // Empty object vs real zeros — still treat as zeros, but only if the
    // bucket actually looked like metrics (has at least one known key).
    const hasKey =
      "impression" in bucket ||
      "IMPRESSION" in bucket ||
      "save" in bucket ||
      "SAVE" in bucket ||
      "clickthrough" in bucket ||
      "CLICKTHROUGH" in bucket ||
      "outbound_click" in bucket ||
      "OUTBOUND_CLICK" in bucket;
    if (!hasKey) return null;
  }
  return { impressions, saves, outbound };
}

export function parseListedPinMetrics(raw: unknown): {
  impressions: number;
  saves: number;
  outbound: number;
} {
  const zero = { impressions: 0, saves: 0, outbound: 0 };
  if (!raw) return zero;
  const items = Array.isArray(raw) ? raw : [raw];
  let best = zero;
  let bestTotal = -1;
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const bucket =
      metricsFromBucket(rec.all_time as Record<string, unknown> | undefined) ??
      metricsFromBucket(rec["90d"] as Record<string, unknown> | undefined) ??
      metricsFromBucket(rec);
    if (!bucket) continue;
    const total = bucket.impressions + bucket.saves + bucket.outbound;
    if (total > bestTotal) {
      best = bucket;
      bestTotal = total;
    }
  }
  return best;
}

function listedPinFromApi(raw: {
  id: string;
  created_at?: string;
  link?: string | null;
  title?: string | null;
  creative_type?: string | null;
  is_owner?: boolean;
  pin_metrics?: unknown;
  media?: { media_type?: string } | null;
}): ListedPin {
  const creative = (raw.creative_type ?? "").toUpperCase();
  const mediaType = (raw.media?.media_type ?? "").toLowerCase();
  const metrics = parseListedPinMetrics(raw.pin_metrics);
  return {
    id: raw.id,
    createdAt: raw.created_at ?? null,
    link: raw.link ?? null,
    title: raw.title ?? null,
    creativeType: raw.creative_type ?? null,
    isOwner: raw.is_owner !== false,
    isVideo: creative.includes("VIDEO") || mediaType === "video",
    impressions: metrics.impressions,
    saves: metrics.saves,
    outbound: metrics.outbound,
  };
}

/** Every pin on the authenticated account (Created tab), with 90d/lifetime metrics. */
export async function listAllPins(opts: { maxPages?: number } = {}): Promise<ListedPin[]> {
  const items = await paginate<{
    id: string;
    created_at?: string;
    link?: string | null;
    title?: string | null;
    creative_type?: string | null;
    is_owner?: boolean;
    pin_metrics?: unknown;
    media?: { media_type?: string } | null;
  }>("/pins?page_size=100&pin_metrics=true", { maxPages: opts.maxPages ?? 15 });
  return items.map(listedPinFromApi);
}

export async function deletePin(pinId: string): Promise<void> {
  await pinterestFetch(`/pins/${encodeURIComponent(pinId)}`, {
    method: "DELETE",
  });
}

export type PinterestFollowedUser = { username: string };

function usernameFromFollowItem(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const rec = item as Record<string, unknown>;
  if (typeof rec.username === "string" && rec.username.trim()) {
    return rec.username.trim();
  }
  const nested = rec.user;
  if (nested && typeof nested === "object") {
    const u = (nested as { username?: unknown }).username;
    if (typeof u === "string" && u.trim()) return u.trim();
  }
  return null;
}

/** Accounts this user explicitly follows. */
export async function listFollowing(opts: { maxPages?: number } = {}): Promise<
  PinterestFollowedUser[]
> {
  const items = await paginate<unknown>(
    "/user_account/following?explicit_following=true&page_size=100",
    { maxPages: opts.maxPages ?? 8 },
  );
  const seen = new Set<string>();
  const out: PinterestFollowedUser[] = [];
  for (const item of items) {
    const username = usernameFromFollowItem(item);
    if (!username) continue;
    const key = username.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ username });
  }
  return out;
}

export async function followUser(username: string): Promise<void> {
  await pinterestFetch(
    `/user_account/following/${encodeURIComponent(username)}`,
    {
      method: "POST",
      body: JSON.stringify({ auto_follow: false }),
    },
  );
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

/**
 * Build a Pinterest-compatible cover for a video pin.
 *
 * Pinterest video pins accept ONLY JPEG/PNG covers (WebP — which our catalog
 * uses — is rejected with "The format of the image is not supported", even
 * though WebP is fine for photo pins). We fetch the source image and transcode
 * it to JPEG, returning it as base64 so it can be embedded directly in the pin
 * payload (`cover_image_data`). Embedding avoids relying on Pinterest being able
 * to re-fetch a converted URL, so it works identically in dev and prod.
 */
async function buildJpegCover(
  coverImageUrl: string,
): Promise<{ contentType: string; data: string }> {
  const res = await fetch(coverImageUrl);
  if (!res.ok) {
    throw new PinterestError(
      `Could not fetch cover image (${res.status}) from ${coverImageUrl}`,
      res.status,
    );
  }
  const input = Buffer.from(await res.arrayBuffer());
  try {
    const jpeg = await sharp(input)
      .rotate() // respect EXIF orientation
      .resize({ width: 1000, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { contentType: "image/jpeg", data: jpeg.toString("base64") };
  } catch (err) {
    throw new PinterestError(
      `Failed to prepare a JPEG cover for the video: ${err instanceof Error ? err.message : String(err)}`,
      422,
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

  // Prepare the JPEG cover BEFORE uploading the video, so a bad cover fails fast
  // without leaving an orphaned media upload.
  const cover = await buildJpegCover(input.coverImageUrl);

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
      // JPEG cover embedded inline — Pinterest rejects WebP covers.
      cover_image_content_type: cover.contentType,
      cover_image_data: cover.data,
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

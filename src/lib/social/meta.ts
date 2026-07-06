/**
 * Meta Graph API client — Instagram + Facebook content publishing.
 *
 * Both platforms run on the Graph API (graph.facebook.com). A single long-lived
 * Page access token (derived from the connected admin's long-lived user token)
 * drives both: Facebook Page posts directly, and the Instagram Business account
 * linked to that Page.
 *
 * Publishing models (mirrors how the products appear on-site):
 *   - Instagram: one carousel per listing (up to 10 photos) + the video as a
 *     Reel. Carousels use the 3-step container flow (create children → create
 *     parent → publish); Reels need status polling before publish.
 *   - Facebook: one multi-photo post per listing (unpublished photos stitched
 *     into a /feed post) + the video via file_url.
 *
 * Token resolution: social_tokens rows "facebook" and "instagram" (both hold the
 * same Page token; accountId differs — Page id vs IG user id). Falls back to
 * env vars for a manual bootstrap.
 *
 * Production requires Meta App Review + Business Verification for
 * `instagram_content_publish`, `pages_manage_posts`, `publish_video`, etc.
 *
 * Docs: https://developers.facebook.com/docs/instagram-platform/content-publishing
 */

import { getToken } from "@/lib/social/token-store";

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v25.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Instagram allows at most 10 items in a carousel. */
export const IG_CAROUSEL_MAX = 10;

export function isMetaConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

export class MetaError extends Error {
  status: number;
  code?: number;
  constructor(message: string, status: number, code?: number) {
    super(message);
    this.name = "MetaError";
    this.status = status;
    this.code = code;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type GraphResponse<T> = T & {
  error?: { message?: string; code?: number; type?: string };
};

async function graphFetch<T>(
  path: string,
  opts: {
    method?: "GET" | "POST";
    params?: Record<string, string | undefined>;
    token: string;
  },
): Promise<T> {
  const method = opts.method ?? "GET";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.params ?? {})) {
    if (v !== undefined) params.set(k, v);
  }
  // OAuth token endpoints carry app creds in params and take no bearer token.
  if (opts.token) params.set("access_token", opts.token);

  const url =
    method === "GET" ? `${GRAPH}/${path}?${params.toString()}` : `${GRAPH}/${path}`;
  const res = await fetch(url, {
    method,
    ...(method === "POST"
      ? {
          body: params,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      : {}),
  });
  const text = await res.text();
  let json: GraphResponse<T> = {} as GraphResponse<T>;
  try {
    json = JSON.parse(text);
  } catch {
    // keep empty
  }
  if (!res.ok || json.error) {
    throw new MetaError(
      json.error?.message ?? `Meta API ${res.status}: ${text.slice(0, 300)}`,
      res.status,
      json.error?.code,
    );
  }
  return json as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Token resolution
// ─────────────────────────────────────────────────────────────────────────────

/** The Page access token (shared by IG + FB). DB row wins over env var. */
async function resolvePageToken(): Promise<string> {
  try {
    const fb = await getToken("facebook");
    if (fb?.accessToken) return fb.accessToken;
    const ig = await getToken("instagram");
    if (ig?.accessToken) return ig.accessToken;
  } catch {
    // DB unavailable — fall through
  }
  const env = process.env.META_PAGE_ACCESS_TOKEN;
  if (!env) throw new MetaError("Meta is not connected (no Page token).", 401);
  return env;
}

async function resolveIgUserId(): Promise<string> {
  try {
    const ig = await getToken("instagram");
    if (ig?.accountId) return ig.accountId;
  } catch {
    /* fall through */
  }
  const env = process.env.INSTAGRAM_BUSINESS_ID;
  if (!env) throw new MetaError("Instagram business account id is not set.", 400);
  return env;
}

async function resolvePageId(): Promise<string> {
  try {
    const fb = await getToken("facebook");
    if (fb?.accountId) return fb.accountId;
  } catch {
    /* fall through */
  }
  const env = process.env.FACEBOOK_PAGE_ID;
  if (!env) throw new MetaError("Facebook Page id is not set.", 400);
  return env;
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth — token exchange + page discovery
// ─────────────────────────────────────────────────────────────────────────────

/** Exchange an OAuth code for a short-lived user access token. */
export async function exchangeCodeForUserToken(
  code: string,
  redirectUri: string,
): Promise<string> {
  const data = await graphFetch<{ access_token: string }>("oauth/access_token", {
    token: "", // no token needed; app creds go in params
    params: {
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      redirect_uri: redirectUri,
      code,
    },
  });
  return data.access_token;
}

/** Upgrade a short-lived user token to a long-lived (~60 day) user token. */
export async function getLongLivedUserToken(
  shortToken: string,
): Promise<string> {
  const data = await graphFetch<{ access_token: string }>("oauth/access_token", {
    token: "",
    params: {
      grant_type: "fb_exchange_token",
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      fb_exchange_token: shortToken,
    },
  });
  return data.access_token;
}

export type ManagedPage = {
  pageId: string;
  pageName: string;
  /** Non-expiring Page access token (from a long-lived user token). */
  pageAccessToken: string;
  igUserId: string | null;
  igUsername: string | null;
};

/**
 * Discover the first Page the connected user manages, its non-expiring Page
 * token, and the linked Instagram business account.
 */
export async function getManagedPage(
  userToken: string,
): Promise<ManagedPage | null> {
  const data = await graphFetch<{
    data: Array<{
      id: string;
      name: string;
      access_token: string;
      instagram_business_account?: { id: string };
    }>;
  }>("me/accounts", {
    token: userToken,
    params: { fields: "id,name,access_token,instagram_business_account" },
  });

  const preferredPageId = process.env.FACEBOOK_PAGE_ID;
  const page =
    (preferredPageId && data.data?.find((p) => p.id === preferredPageId)) ||
    data.data?.[0];
  if (!page) return null;

  let igUsername: string | null = null;
  const igUserId = page.instagram_business_account?.id ?? null;
  if (igUserId) {
    try {
      const ig = await graphFetch<{ username: string }>(igUserId, {
        token: page.access_token,
        params: { fields: "username" },
      });
      igUsername = ig.username ?? null;
    } catch {
      igUsername = null;
    }
  }

  return {
    pageId: page.id,
    pageName: page.name,
    pageAccessToken: page.access_token,
    igUserId,
    igUsername,
  };
}

export type MetaConnection = {
  connected: boolean;
  pageName?: string;
  igUsername?: string;
  message: string;
};

/** Verify the stored token still works (for the admin connection panel). */
export async function getMetaConnection(): Promise<MetaConnection> {
  let token: string;
  try {
    token = await resolvePageToken();
  } catch {
    return { connected: false, message: "Not connected." };
  }
  try {
    const pageId = await resolvePageId().catch(() => null);
    const igId = await resolveIgUserId().catch(() => null);
    const out: MetaConnection = { connected: true, message: "Connected." };
    if (pageId) {
      const page = await graphFetch<{ name: string }>(pageId, {
        token,
        params: { fields: "name" },
      });
      out.pageName = page.name;
    }
    if (igId) {
      const ig = await graphFetch<{ username: string }>(igId, {
        token,
        params: { fields: "username" },
      });
      out.igUsername = ig.username;
    }
    return out;
  } catch (err) {
    return {
      connected: false,
      message: err instanceof Error ? err.message : "Connection check failed.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Instagram publishing
// ─────────────────────────────────────────────────────────────────────────────

export type PublishedPost = { id: string; url: string };

async function waitForIgContainer(
  containerId: string,
  token: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 150_000;
  const intervalMs = opts.intervalMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const data = await graphFetch<{ status_code: string }>(containerId, {
      token,
      params: { fields: "status_code" },
    });
    const s = data.status_code?.toUpperCase();
    if (s === "FINISHED") return;
    if (s === "ERROR" || s === "EXPIRED") {
      throw new MetaError(`Instagram media processing ${s}.`, 502);
    }
    await sleep(intervalMs);
  }
  throw new MetaError("Timed out waiting for Instagram media processing.", 504);
}

async function publishIgContainer(
  igUserId: string,
  creationId: string,
  token: string,
): Promise<PublishedPost> {
  const data = await graphFetch<{ id: string }>(`${igUserId}/media_publish`, {
    method: "POST",
    token,
    params: { creation_id: creationId },
  });
  return {
    id: data.id,
    url: `https://www.instagram.com/p/${data.id}/`,
  };
}

/**
 * Publish an Instagram photo post: a single image when only one photo is given,
 * otherwise a carousel of up to 10.
 */
export async function publishInstagramCarousel(input: {
  imageUrls: string[];
  caption: string;
}): Promise<PublishedPost> {
  const token = await resolvePageToken();
  const igUserId = await resolveIgUserId();
  const urls = input.imageUrls.filter(Boolean).slice(0, IG_CAROUSEL_MAX);
  if (urls.length === 0) throw new MetaError("No images to publish.", 400);

  // Single image → no carousel wrapper.
  if (urls.length === 1) {
    const container = await graphFetch<{ id: string }>(`${igUserId}/media`, {
      method: "POST",
      token,
      params: { image_url: urls[0], caption: input.caption },
    });
    await waitForIgContainer(container.id, token);
    return publishIgContainer(igUserId, container.id, token);
  }

  // Carousel: one child container per image, then a parent CAROUSEL container.
  const childIds: string[] = [];
  for (const url of urls) {
    const child = await graphFetch<{ id: string }>(`${igUserId}/media`, {
      method: "POST",
      token,
      params: { image_url: url, is_carousel_item: "true" },
    });
    childIds.push(child.id);
  }
  for (const id of childIds) await waitForIgContainer(id, token);

  const parent = await graphFetch<{ id: string }>(`${igUserId}/media`, {
    method: "POST",
    token,
    params: {
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption: input.caption,
    },
  });
  await waitForIgContainer(parent.id, token);
  return publishIgContainer(igUserId, parent.id, token);
}

/** Publish a product video as an Instagram Reel. */
export async function publishInstagramReel(input: {
  videoUrl: string;
  caption: string;
  coverUrl?: string;
}): Promise<PublishedPost> {
  const token = await resolvePageToken();
  const igUserId = await resolveIgUserId();

  const container = await graphFetch<{ id: string }>(`${igUserId}/media`, {
    method: "POST",
    token,
    params: {
      media_type: "REELS",
      video_url: input.videoUrl,
      caption: input.caption,
      cover_url: input.coverUrl,
      share_to_feed: "true",
    },
  });
  await waitForIgContainer(container.id, token);
  return publishIgContainer(igUserId, container.id, token);
}

// ─────────────────────────────────────────────────────────────────────────────
// Facebook publishing
// ─────────────────────────────────────────────────────────────────────────────

/** Publish a multi-photo (or single) post to the Facebook Page feed. */
export async function publishFacebookPhotos(input: {
  imageUrls: string[];
  message: string;
}): Promise<PublishedPost> {
  const token = await resolvePageToken();
  const pageId = await resolvePageId();
  const urls = input.imageUrls.filter(Boolean);
  if (urls.length === 0) throw new MetaError("No images to publish.", 400);

  // Single photo → direct published photo post.
  if (urls.length === 1) {
    const data = await graphFetch<{ id: string; post_id?: string }>(
      `${pageId}/photos`,
      {
        method: "POST",
        token,
        params: { url: urls[0], message: input.message, published: "true" },
      },
    );
    const postId = data.post_id ?? data.id;
    return { id: postId, url: `https://www.facebook.com/${postId}` };
  }

  // Multi-photo: upload each as unpublished, then stitch into one feed post.
  const mediaFbids: string[] = [];
  for (const url of urls) {
    const photo = await graphFetch<{ id: string }>(`${pageId}/photos`, {
      method: "POST",
      token,
      params: { url, published: "false" },
    });
    mediaFbids.push(photo.id);
  }

  const params: Record<string, string> = { message: input.message };
  mediaFbids.forEach((fbid, i) => {
    params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: fbid });
  });

  const post = await graphFetch<{ id: string }>(`${pageId}/feed`, {
    method: "POST",
    token,
    params,
  });
  return { id: post.id, url: `https://www.facebook.com/${post.id}` };
}

/** Publish a product video to the Facebook Page (via public file_url). */
export async function publishFacebookVideo(input: {
  videoUrl: string;
  description: string;
}): Promise<PublishedPost> {
  const token = await resolvePageToken();
  const pageId = await resolvePageId();
  const data = await graphFetch<{ id: string }>(`${pageId}/videos`, {
    method: "POST",
    token,
    params: { file_url: input.videoUrl, description: input.description },
  });
  return {
    id: data.id,
    url: `https://www.facebook.com/${data.id}`,
  };
}

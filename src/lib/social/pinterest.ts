/**
 * Pinterest API v5 client — programmatic publishing for the Social Studio.
 *
 * Pinterest is the one major social platform that supports true end-to-end
 * automated publishing (TikTok requires an app audit; Instagram needs a
 * Business account + Graph API). We use a long-lived access token tied to the
 * brand's own account, generated once in the Pinterest developer portal.
 *
 * Setup (one-time):
 *   1. developers.pinterest.com → create an app (Standard access).
 *   2. Generate an access token with scopes: boards:read, pins:read, pins:write.
 *   3. Set PINTEREST_ACCESS_TOKEN in the environment.
 *
 * Docs: https://developers.pinterest.com/docs/api/v5/pins-create/
 *
 * Note: image_url passed to createPin must be a publicly reachable HTTPS URL —
 * our creatives live on the public R2 bucket, so they qualify.
 */

const API_BASE =
  process.env.PINTEREST_API_BASE?.replace(/\/$/, "") ??
  "https://api.pinterest.com/v5";

export function isPinterestConfigured(): boolean {
  return Boolean(process.env.PINTEREST_ACCESS_TOKEN);
}

function authHeaders(): HeadersInit {
  const token = process.env.PINTEREST_ACCESS_TOKEN;
  if (!token) throw new Error("PINTEREST_ACCESS_TOKEN is not set.");
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
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
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

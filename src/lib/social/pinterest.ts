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

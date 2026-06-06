/**
 * Meta Conversions API (CAPI) — server-side event forwarding.
 *
 * Server-side events bypass iOS 14 browser restrictions and ad blockers,
 * delivering a more complete signal to Meta's algorithm for ad optimisation.
 * When paired with client-side Pixel events, Meta deduplicates on `event_id`
 * so conversions are never double-counted.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 */

const API_VERSION = "v19.0";
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN;
const TEST_CODE = process.env.META_CAPI_TEST_CODE; // only set during testing

function isConfigured(): boolean {
  return Boolean(PIXEL_ID && ACCESS_TOKEN);
}

/** Hash a value with SHA-256 (Meta requires lowercase-trimmed hashed PII). */
async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.toLowerCase().trim());
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type CAPIUserData = {
  email?: string;       // will be SHA-256 hashed automatically
  clientIp?: string;
  userAgent?: string;
  fbc?: string;         // _fbc cookie value (Facebook click ID)
  fbp?: string;         // _fbp cookie value (Facebook browser ID)
};

export type CAPICustomData = {
  currency?: string;
  value?: number;
  orderId?: string;
  contents?: Array<{ id: string; quantity: number; itemPrice?: number }>;
};

export type CAPIEventName =
  | "Purchase"
  | "InitiateCheckout"
  | "AddToCart"
  | "ViewContent"
  | "Lead"
  | "PageView";

export type CAPIEventPayload = {
  eventName: CAPIEventName;
  eventId?: string;
  eventSourceUrl?: string;
  userData?: CAPIUserData;
  customData?: CAPICustomData;
};

async function buildUserData(
  ud: CAPIUserData,
): Promise<Record<string, string | undefined>> {
  const out: Record<string, string | undefined> = {};
  if (ud.email) out.em = await sha256(ud.email);
  if (ud.clientIp) out.client_ip_address = ud.clientIp;
  if (ud.userAgent) out.client_user_agent = ud.userAgent;
  if (ud.fbc) out.fbc = ud.fbc;
  if (ud.fbp) out.fbp = ud.fbp;
  return out;
}

/**
 * Send a single event to the Meta Conversions API.
 * Safe to call from any server component, API route, or webhook handler.
 * Silently no-ops if NEXT_PUBLIC_META_PIXEL_ID / META_CAPI_ACCESS_TOKEN are unset.
 */
export async function sendCapiEvent(payload: CAPIEventPayload): Promise<void> {
  if (!isConfigured()) return;

  const userData = payload.userData
    ? await buildUserData(payload.userData)
    : {};

  const event: Record<string, unknown> = {
    event_name: payload.eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: "website",
    user_data: userData,
  };
  if (payload.eventId) event.event_id = payload.eventId;
  if (payload.eventSourceUrl) event.event_source_url = payload.eventSourceUrl;
  if (payload.customData) {
    const cd: Record<string, unknown> = {};
    if (payload.customData.currency) cd.currency = payload.customData.currency;
    if (payload.customData.value !== undefined) cd.value = payload.customData.value;
    if (payload.customData.orderId) cd.order_id = payload.customData.orderId;
    if (payload.customData.contents) {
      cd.content_type = "product";
      cd.contents = payload.customData.contents.map((c) => ({
        id: c.id,
        quantity: c.quantity,
        ...(c.itemPrice !== undefined ? { item_price: c.itemPrice } : {}),
      }));
    }
    event.custom_data = cd;
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [event],
        access_token: ACCESS_TOKEN,
        ...(TEST_CODE ? { test_event_code: TEST_CODE } : {}),
      }),
    });
    if (!res.ok) {
      console.error("[meta-capi] API error:", res.status, await res.text());
    }
  } catch (err) {
    console.error("[meta-capi] network error:", err);
  }
}

/** Convenience wrapper for the most important conversion event: Purchase. */
export async function sendCapiPurchase(opts: {
  orderId: string | number;
  totalCents: number;
  currency: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  items: Array<{ productId: string | number; quantity: number; unitCents: number }>;
}): Promise<void> {
  const SITE = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  await sendCapiEvent({
    eventName: "Purchase",
    eventId: `purchase_${opts.orderId}`,
    eventSourceUrl: `${SITE}/checkout/success`,
    userData: {
      email: opts.email,
      clientIp: opts.ip,
      userAgent: opts.userAgent,
    },
    customData: {
      currency: opts.currency.toUpperCase(),
      value: opts.totalCents / 100,
      orderId: String(opts.orderId),
      contents: opts.items.map((i) => ({
        id: String(i.productId),
        quantity: i.quantity,
        itemPrice: i.unitCents / 100,
      })),
    },
  });
}

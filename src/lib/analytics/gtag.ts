/**
 * GA4 ecommerce analytics — typed event layer.
 *
 * A thin, strongly-typed wrapper over gtag so every conversion event across the
 * funnel (view_item → add_to_cart → begin_checkout → purchase) is emitted with
 * GA4's recommended ecommerce schema. `commerce.ts` fans the same typed
 * contract out to the configured ad pixels.
 *
 * Safe to import anywhere: every function no-ops when GA isn't configured or
 * when running on the server, and queues events while gtag.js is still loading.
 */

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

/** True when a GA4 Measurement ID is configured and we're in the browser. */
export function isGaEnabled(): boolean {
  return Boolean(GA_ID) && typeof window !== "undefined";
}

type GtagParams = Record<string, unknown>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __y2kGaConfigured?: boolean;
  }
}

/**
 * Install the tiny official dataLayer queue before the network script arrives.
 * This prevents fast add-to-cart/checkout/purchase effects from being dropped
 * during the race between React hydration and `lazyOnload` gtag loading.
 */
function getGtag(): NonNullable<Window["gtag"]> | null {
  if (!isGaEnabled()) return null;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag =
    window.gtag ??
    ((...args: unknown[]) => {
      window.dataLayer!.push(args);
    });
  if (!window.__y2kGaConfigured && GA_ID) {
    window.__y2kGaConfigured = true;
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, { send_page_view: false });
  }
  return window.gtag;
}

/** GA4 recommended ecommerce item shape. */
export type GaItem = {
  item_id: string;
  item_name: string;
  price?: number;
  quantity?: number;
  item_variant?: string;
  item_brand?: string;
  item_category?: string;
};

/** Low-level passthrough to gtag('event', …). No-ops when GA is disabled. */
export function gaEvent(name: string, params: GtagParams = {}): void {
  getGtag()?.("event", name, params);
}

/** Manual SPA page_view — paired with `send_page_view: false` in the config. */
export function gaPageview(url: string): void {
  if (!GA_ID) return;
  getGtag()?.("event", "page_view", {
    page_path: url,
    page_location: window.location.origin + url,
    page_title: document.title,
  });
}

/** A minimal cart line, structurally compatible with the Zustand CartItem. */
export type TrackableItem = {
  productId: number | string;
  slug?: string;
  title: string;
  price: number;
  quantity?: number;
  options?: Record<string, string>;
};

/** Map a cart line into a GA4 ecommerce item. */
export function toGaItem(item: TrackableItem): GaItem {
  const variant = item.options
    ? Object.values(item.options).filter(Boolean).join(" / ")
    : undefined;
  return {
    item_id: String(item.slug ?? item.productId),
    item_name: item.title,
    price: round2(item.price),
    quantity: item.quantity ?? 1,
    item_brand: "Y2KASE",
    ...(variant ? { item_variant: variant } : {}),
  };
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function itemsValue(items: TrackableItem[]): number {
  return round2(
    items.reduce((sum, i) => sum + i.price * (i.quantity ?? 1), 0),
  );
}

// ─── Ecommerce funnel events ─────────────────────────────────────────────────

export function trackViewItem(item: TrackableItem, currency: string): void {
  gaEvent("view_item", {
    currency: currency.toUpperCase(),
    value: round2(item.price),
    items: [toGaItem(item)],
  });
}

export function trackAddToCart(item: TrackableItem, currency: string): void {
  gaEvent("add_to_cart", {
    currency: currency.toUpperCase(),
    value: round2(item.price * (item.quantity ?? 1)),
    items: [toGaItem(item)],
  });
}

export function trackBeginCheckout(
  items: TrackableItem[],
  currency: string,
  coupon?: string,
  value?: number,
): void {
  gaEvent("begin_checkout", {
    currency: currency.toUpperCase(),
    value: value != null ? round2(value) : itemsValue(items),
    ...(coupon ? { coupon } : {}),
    items: items.map(toGaItem),
  });
}

export type PurchasePayload = {
  transactionId: string;
  value: number;
  shipping?: number;
  tax?: number;
  currency: string;
  coupon?: string;
  items: TrackableItem[];
};

export function trackPurchase(p: PurchasePayload): void {
  gaEvent("purchase", {
    transaction_id: p.transactionId,
    value: round2(p.value),
    currency: p.currency.toUpperCase(),
    ...(p.shipping != null ? { shipping: round2(p.shipping) } : {}),
    ...(p.tax != null ? { tax: round2(p.tax) } : {}),
    ...(p.coupon ? { coupon: p.coupon } : {}),
    items: p.items.map(toGaItem),
  });
}

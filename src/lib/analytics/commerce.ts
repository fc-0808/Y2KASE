"use client";

import {
  trackAddToCart as trackGaAddToCart,
  trackBeginCheckout as trackGaBeginCheckout,
  trackPurchase as trackGaPurchase,
  trackViewItem as trackGaViewItem,
  type PurchasePayload,
  type TrackableItem,
} from "@/lib/analytics/gtag";
import { trackFbEvent } from "@/components/analytics/MetaPixel";
import { trackPinEvent } from "@/components/analytics/PinterestTag";
import { trackTtEvent } from "@/components/analytics/TikTokPixel";

function round2(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function itemId(item: TrackableItem): string {
  return String(item.slug ?? item.productId);
}

function itemValue(item: TrackableItem): number {
  return round2(item.price * (item.quantity ?? 1));
}

function totalValue(items: TrackableItem[]): number {
  return round2(items.reduce((sum, item) => sum + itemValue(item), 0));
}

function metaContents(items: TrackableItem[]) {
  return items.map((item) => ({
    id: itemId(item),
    quantity: item.quantity ?? 1,
    item_price: round2(item.price),
  }));
}

function tiktokContents(items: TrackableItem[]) {
  return items.map((item) => ({
    content_id: itemId(item),
    content_name: item.title,
    content_type: "product",
    quantity: item.quantity ?? 1,
    price: round2(item.price),
  }));
}

export function trackProductView(
  item: TrackableItem,
  currency: string,
): void {
  const normalizedCurrency = currency.toUpperCase();
  trackGaViewItem(item, normalizedCurrency);
  trackFbEvent("track", "ViewContent", {
    content_ids: [itemId(item)],
    content_name: item.title,
    content_type: "product",
    value: itemValue(item),
    currency: normalizedCurrency,
  });
  trackTtEvent("ViewContent", {
    contents: tiktokContents([item]),
    value: itemValue(item),
    currency: normalizedCurrency,
  });
}

export function trackCartAdd(item: TrackableItem, currency: string): void {
  const normalizedCurrency = currency.toUpperCase();
  const value = itemValue(item);
  trackGaAddToCart(item, normalizedCurrency);
  trackFbEvent("track", "AddToCart", {
    contents: metaContents([item]),
    content_ids: [itemId(item)],
    content_name: item.title,
    content_type: "product",
    value,
    currency: normalizedCurrency,
  });
  trackTtEvent("AddToCart", {
    contents: tiktokContents([item]),
    value,
    currency: normalizedCurrency,
  });
  trackPinEvent("addtocart", {
    value,
    order_quantity: item.quantity ?? 1,
    currency: normalizedCurrency,
    line_items: [
      {
        product_id: itemId(item),
        product_name: item.title,
        product_price: round2(item.price),
        product_quantity: item.quantity ?? 1,
      },
    ],
  });
}

export function trackCheckoutStart(
  items: TrackableItem[],
  currency: string,
  coupon?: string,
  value?: number,
): void {
  const normalizedCurrency = currency.toUpperCase();
  const eventValue = value != null ? round2(value) : totalValue(items);
  trackGaBeginCheckout(items, normalizedCurrency, coupon, eventValue);
  trackFbEvent("track", "InitiateCheckout", {
    contents: metaContents(items),
    content_ids: items.map(itemId),
    content_type: "product",
    num_items: items.reduce((sum, item) => sum + (item.quantity ?? 1), 0),
    value: eventValue,
    currency: normalizedCurrency,
  });
  trackTtEvent("InitiateCheckout", {
    contents: tiktokContents(items),
    value: eventValue,
    currency: normalizedCurrency,
  });
}

export function trackCommercePurchase(payload: PurchasePayload): void {
  const normalizedCurrency = payload.currency.toUpperCase();
  const eventId = `purchase_${payload.transactionId}`;
  trackGaPurchase(payload);
  trackFbEvent(
    "track",
    "Purchase",
    {
      contents: metaContents(payload.items),
      content_ids: payload.items.map(itemId),
      content_type: "product",
      value: round2(payload.value),
      currency: normalizedCurrency,
    },
    { eventID: eventId },
  );
  trackTtEvent("CompletePayment", {
    contents: tiktokContents(payload.items),
    value: round2(payload.value),
    currency: normalizedCurrency,
    order_id: payload.transactionId,
  });
  trackPinEvent("checkout", {
    order_id: payload.transactionId,
    value: round2(payload.value),
    order_quantity: payload.items.reduce(
      (sum, item) => sum + (item.quantity ?? 1),
      0,
    ),
    currency: normalizedCurrency,
    line_items: payload.items.map((item) => ({
      product_id: itemId(item),
      product_name: item.title,
      product_price: round2(item.price),
      product_quantity: item.quantity ?? 1,
    })),
  });
}

"use client";

/**
 * Fires configured commerce purchase conversions exactly once for a confirmed
 * order. Meta uses the same event id as server-side CAPI for deduplication.
 *
 * The success page is force-dynamic and a buyer may refresh or revisit it, so we
 * dedupe on the transaction id via sessionStorage — sending two purchase events
 * for one order would inflate revenue and corrupt ROAS in every connected ad
 * platform. Order data is passed from the server (the source of truth) rather
 * than reconstructed from the client cart, which has already been cleared.
 */

import { useEffect } from "react";
import type { PurchasePayload } from "@/lib/analytics/gtag";
import { trackCommercePurchase } from "@/lib/analytics/commerce";

const trackedPurchases = new Set<string>();

export function PurchaseTracking({ order }: { order: PurchasePayload }) {
  useEffect(() => {
    const key = `y2k_purchase_${order.transactionId}`;
    if (trackedPurchases.has(key)) return;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // The module-level set still deduplicates strict/private storage modes.
    }
    trackedPurchases.add(key);
    trackCommercePurchase(order);
  }, [order]);

  return null;
}

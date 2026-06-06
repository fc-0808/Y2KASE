"use client";

/**
 * Fires the GA4 `purchase` conversion exactly once for a confirmed order.
 *
 * The success page is force-dynamic and a buyer may refresh or revisit it, so we
 * dedupe on the transaction id via sessionStorage — sending two purchase events
 * for one order would inflate revenue and corrupt ROAS in every connected ad
 * platform. Order data is passed from the server (the source of truth) rather
 * than reconstructed from the client cart, which has already been cleared.
 */

import { useEffect } from "react";
import {
  trackPurchase,
  type PurchasePayload,
} from "@/lib/analytics/gtag";

export function PurchaseTracking({ order }: { order: PurchasePayload }) {
  useEffect(() => {
    const key = `y2k_purchase_${order.transactionId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage unavailable (private mode) — still fire once per mount.
    }
    trackPurchase(order);
  }, [order]);

  return null;
}

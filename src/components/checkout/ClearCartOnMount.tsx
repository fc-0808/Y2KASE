"use client";

import { useEffect } from "react";
import { useCart } from "@/lib/store/cart";

/**
 * Clears the persisted cart once the buyer lands on the order confirmation page.
 * Rendered only after a verified-paid order, so it's safe to empty the bag here.
 */
export function ClearCartOnMount() {
  const clear = useCart((s) => s.clear);
  useEffect(() => {
    clear();
  }, [clear]);
  return null;
}

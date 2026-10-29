import { BUNDLE, type LinePlan } from "@/lib/promotions";

/**
 * How one cart line is stored on an order.
 *
 * Buy 2, Get 2 Free can make only some units of a quantity free. Keeping those
 * units on one row ("Qty 2 × $34.99") shows the paid unit and the free unit as
 * a single charge. A line like that is stored as one row per unit. A quantity
 * that is entirely paid stays on one row.
 */
export type StoredOrderLine = {
  quantity: number;
  /** Catalog unit price, even when the unit is free. The order discount subtracts free units. */
  unitCents: number;
  bundleFree: boolean;
};

export function bundleFreeLineLabel(): string {
  return `Free with ${BUNDLE.label}`;
}

/** Stripe product names are capped at 250 characters. */
const STRIPE_PRODUCT_NAME_MAX = 250;

/**
 * Free units must not reuse the paid line's product name. Stripe matches
 * inline products by name, and a shared name can collapse the two quantities
 * into one.
 */
export function stripeProductName(title: string, free: boolean): string {
  const suffix = free ? " (Free)" : "";
  const limit = STRIPE_PRODUCT_NAME_MAX - suffix.length;
  const trimmed = title.trim();
  const base =
    trimmed.length > limit
      ? `${trimmed.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
      : trimmed;
  return `${base}${suffix}`;
}

/**
 * Rows to persist for one priced cart line.
 *
 * Coupon orders stay as the shopper entered them (the percent comes off the
 * order, not by splitting the line). When Buy 2, Get 2 Free makes only some
 * units of a quantity free, each unit is its own row. A quantity that is
 * entirely paid stays together, so "Qty 2 × $34.99" still means two paid units.
 */
export function bundleOrderLines(args: {
  grossUnitCents: number;
  quantity: number;
  plan: LinePlan;
  bundleActive: boolean;
}): StoredOrderLine[] {
  const { grossUnitCents, quantity, plan, bundleActive } = args;
  const covered = plan.paidQty + plan.freeQty === quantity;
  const single = {
    quantity,
    unitCents: grossUnitCents,
    bundleFree: bundleActive && covered && plan.freeQty > 0 && plan.paidQty === 0,
  };

  if (!bundleActive || !covered || plan.freeQty <= 0 || quantity <= 1) {
    return [single];
  }

  const rows: StoredOrderLine[] = [];
  for (let i = 0; i < plan.paidQty; i++) {
    rows.push({ quantity: 1, unitCents: grossUnitCents, bundleFree: false });
  }
  for (let i = 0; i < plan.freeQty; i++) {
    rows.push({ quantity: 1, unitCents: grossUnitCents, bundleFree: true });
  }
  return rows;
}

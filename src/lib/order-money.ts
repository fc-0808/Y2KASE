/**
 * Order money breakdown.
 *
 * Checkout stores the gross subtotal and the amount actually charged. A coupon
 * or bundle sits in `discountCents`, so the receipt identity is:
 *
 *   subtotal − discount + shipping + tax = total
 *
 * Orders placed before that column existed still have the discount baked only
 * into `totalCents`. The gap is the same number, so older receipts add up too.
 */

export type OrderMoneyFields = {
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  discountCents?: number | null;
  discountLabel?: string | null;
  discountCode?: string | null;
};

/** Cents removed from the gross subtotal. */
export function orderDiscountCents(order: OrderMoneyFields): number {
  const stored = order.discountCents ?? 0;
  if (stored > 0) return stored;
  const gap =
    order.subtotalCents +
    order.shippingCents +
    order.taxCents -
    order.totalCents;
  return gap > 0 ? gap : 0;
}

/** Label for the discount row, including the code when one was redeemed. */
export function orderDiscountLabel(order: OrderMoneyFields): string {
  const label = order.discountLabel?.trim();
  const code = order.discountCode?.trim();
  if (label && code) return `${label} (${code})`;
  if (label) return label;
  if (code) return code;
  return "Discount";
}

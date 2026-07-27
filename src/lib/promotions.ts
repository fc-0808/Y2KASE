/**
 * Promotions engine — ISOMORPHIC (safe to import on both the client and server).
 *
 * This is the SINGLE SOURCE OF TRUTH for every storefront discount. The exact
 * same pure math runs in two places, which is what guarantees correctness:
 *
 *   • Client (cart page/drawer) — for an instant, reactive discount preview.
 *   • Server (/api/checkout)    — to build the Stripe line items that are
 *                                 actually charged.
 *
 * Because both sides call `computePromotions`, the price the buyer sees is
 * byte-for-byte the price Stripe charges and the amount persisted on the order.
 * There are NO Stripe promotion codes involved: we compute the discount locally
 * and hand Stripe the finished "math" as adjusted line items.
 *
 * Two MUTUALLY EXCLUSIVE promotions (never stacked):
 *
 *   1. Automatic "Buy 2, Get 2 Free" bundle — activates at 4+ units and makes
 *      the cheapest units free. It tiers: every complete group of 4 units frees
 *      the 2 cheapest of the whole cart (4→2 free, 8→4 free, …).
 *   2. Coupon codes (BESTIE10) — a straight percentage off, only usable when
 *      the bundle is NOT active.
 *
 * The bundle ALWAYS wins: if it is active, any entered coupon is ignored so the
 * store never gives away both at once.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Coupon catalogue (local — no Stripe lookup)
// ─────────────────────────────────────────────────────────────────────────────

export type LocalCoupon = {
  /** Canonical, upper-cased customer-facing code. */
  code: string;
  /** Percentage off the whole order (0–100). */
  percentOff: number;
  /** Short human label shown in the cart summary, e.g. "10% off". */
  label: string;
  /** Optional minimum subtotal (in cents) required to use the code. */
  minSubtotalCents?: number;
};

/**
 * The redeemable coupon codes. Keyed by their upper-cased code for O(1) lookup.
 * Add or retire codes here — the cart preview and checkout both read this map.
 */
export const LOCAL_COUPONS: Record<string, LocalCoupon> = {
  /** The store's one and only advertised code. */
  BESTIE10: { code: "BESTIE10", percentOff: 10, label: "10% off" },

  /**
   * RETIRED — do not advertise, do not issue.
   *
   * This was the welcome-signup code until we consolidated on BESTIE10. It
   * stays redeemable because subscribers were already emailed a 15% promise,
   * and silently invalidating a coupon you have already sent turns into
   * support tickets and chargebacks. Nothing in the storefront offers it any
   * more, so it retires naturally as those subscribers redeem or lapse.
   */
  WELCOME15: { code: "WELCOME15", percentOff: 15, label: "15% off" },
};

/**
 * The offer new email subscribers receive.
 *
 * SINGLE SOURCE OF TRUTH for the welcome discount: the pop-up, the
 * /welcome-gift landing page, the welcome email and the help widget all
 * derive their code AND their percentage from here. That's deliberate — the
 * previous copy hardcoded "15%" in six files, so changing the offer meant
 * finding all six or shipping a number that disagreed with checkout.
 */
export const WELCOME_COUPON: LocalCoupon = LOCAL_COUPONS.BESTIE10;

/** Resolve a raw, user-typed code to a known coupon (case/space-insensitive). */
export function resolveLocalCoupon(
  raw: string | null | undefined,
): LocalCoupon | null {
  if (!raw) return null;
  return LOCAL_COUPONS[raw.trim().toUpperCase()] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bundle config
// ─────────────────────────────────────────────────────────────────────────────

export const BUNDLE = {
  id: "buy2get2",
  label: "Buy 2, Get 2 Free",
  /** Units that make one bundle group (buy 2 + get 2). */
  groupSize: 4,
  /** Free units awarded per completed group. */
  freePerGroup: 2,
} as const;

/** Units the bundle makes free for a given total unit count (tiered). */
export function bundleFreeUnits(totalUnits: number): number {
  if (totalUnits < BUNDLE.groupSize) return 0;
  return Math.floor(totalUnits / BUNDLE.groupSize) * BUNDLE.freePerGroup;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core computation
// ─────────────────────────────────────────────────────────────────────────────

/** A cart line reduced to just what pricing needs. */
export type PromoLine = {
  /** Per-unit price in minor units (cents). */
  unitCents: number;
  quantity: number;
};

/** How a single line should be charged after promotions are applied. */
export type LinePlan = {
  /** Units billed at `unitCents`. */
  paidQty: number;
  /** Units given away free (billed at 0) by the bundle. */
  freeQty: number;
  /** Per-unit charge — reduced for % coupons, unchanged for the bundle. */
  unitCents: number;
};

export type PromoResult = {
  /** Gross subtotal before any discount (cents). */
  subtotalCents: number;
  /** Total value removed by the applied promotion (cents). */
  discountCents: number;
  /** Subtotal the customer actually pays, pre-shipping (cents). */
  totalAfterDiscountCents: number;
  /** True when the automatic bundle is in effect (coupons are then locked out). */
  bundleActive: boolean;
  /** Units the bundle made free (0 when inactive). */
  freeUnits: number;
  /** The code that was applied, or null (also null while the bundle is active). */
  appliedCode: string | null;
  /** Human label of whatever discount was applied, e.g. "Buy 2, Get 2 Free". */
  appliedLabel: string | null;
  /** Per-line charge plan, ALIGNED 1:1 to the input `lines` order. */
  plans: LinePlan[];
  /** Why an entered coupon could not be applied (e.g. bundle active), else null. */
  couponRejectedReason: string | null;
};

/** Message shown when a coupon is entered while the bundle is active. */
export const STACKING_BLOCKED_MESSAGE =
  "Bundle active! Coupon codes cannot be stacked.";

/**
 * Compute the effective promotion for a set of cart lines.
 *
 * @param lines      Cart lines (order is preserved in the returned `plans`).
 * @param couponCode Optional coupon the buyer entered. Ignored if the bundle is
 *                   active (mutual exclusivity).
 */
export function computePromotions(
  lines: PromoLine[],
  couponCode?: string | null,
): PromoResult {
  // Normalise defensively — never trust raw quantities/prices.
  const norm = lines.map((l) => ({
    unitCents: Math.max(0, Math.round(l.unitCents || 0)),
    quantity: Math.max(0, Math.floor(l.quantity || 0)),
  }));

  const subtotalCents = norm.reduce((s, l) => s + l.unitCents * l.quantity, 0);
  const totalUnits = norm.reduce((s, l) => s + l.quantity, 0);
  const freeUnits = bundleFreeUnits(totalUnits);

  // ── 1) Automatic bundle (takes priority over any coupon) ─────────────────
  if (freeUnits > 0) {
    // Expand every unit tagged with its originating line, then free the
    // cheapest `freeUnits` of them across the whole cart.
    const units: { line: number; unitCents: number }[] = [];
    norm.forEach((l, i) => {
      for (let q = 0; q < l.quantity; q++) {
        units.push({ line: i, unitCents: l.unitCents });
      }
    });
    units.sort((a, b) => a.unitCents - b.unitCents);

    const freePerLine = new Array<number>(norm.length).fill(0);
    let discountCents = 0;
    for (let k = 0; k < freeUnits && k < units.length; k++) {
      freePerLine[units[k].line] += 1;
      discountCents += units[k].unitCents;
    }

    const plans: LinePlan[] = norm.map((l, i) => ({
      paidQty: l.quantity - freePerLine[i],
      freeQty: freePerLine[i],
      unitCents: l.unitCents,
    }));

    return {
      subtotalCents,
      discountCents,
      totalAfterDiscountCents: subtotalCents - discountCents,
      bundleActive: true,
      freeUnits,
      appliedCode: null,
      appliedLabel: BUNDLE.label,
      plans,
      couponRejectedReason: couponCode ? STACKING_BLOCKED_MESSAGE : null,
    };
  }

  // ── 2) Coupon code (only when the bundle is not active) ───────────────────
  const coupon = resolveLocalCoupon(couponCode);
  if (coupon) {
    if (coupon.minSubtotalCents && subtotalCents < coupon.minSubtotalCents) {
      return passthrough(
        norm,
        subtotalCents,
        `Spend $${(coupon.minSubtotalCents / 100).toFixed(2)} to use ${coupon.code}.`,
      );
    }

    // Discount per unit (rounded per-line, exactly how Stripe rounds a
    // percent-off coupon) so the preview and the charge always agree.
    const plans: LinePlan[] = norm.map((l) => ({
      paidQty: l.quantity,
      freeQty: 0,
      unitCents: Math.round((l.unitCents * (100 - coupon.percentOff)) / 100),
    }));
    const totalAfterDiscountCents = plans.reduce(
      (s, p) => s + p.unitCents * p.paidQty,
      0,
    );

    return {
      subtotalCents,
      discountCents: subtotalCents - totalAfterDiscountCents,
      totalAfterDiscountCents,
      bundleActive: false,
      freeUnits: 0,
      appliedCode: coupon.code,
      appliedLabel: coupon.label,
      plans,
      couponRejectedReason: null,
    };
  }

  // ── 3) Nothing applied ────────────────────────────────────────────────────
  return passthrough(norm, subtotalCents, null);
}

/** Build a no-discount result whose plans pass the cart through unchanged. */
function passthrough(
  norm: PromoLine[],
  subtotalCents: number,
  couponRejectedReason: string | null,
): PromoResult {
  return {
    subtotalCents,
    discountCents: 0,
    totalAfterDiscountCents: subtotalCents,
    bundleActive: false,
    freeUnits: 0,
    appliedCode: null,
    appliedLabel: null,
    plans: norm.map((l) => ({
      paidQty: l.quantity,
      freeQty: 0,
      unitCents: l.unitCents,
    })),
    couponRejectedReason,
  };
}

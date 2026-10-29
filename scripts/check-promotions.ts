/**
 * Buy 2, Get 2 Free line storage.
 *
 * A quantity of 2 used to be one order row, so a paid unit and a free unit
 * showed up as a single charge. A mixed line is now one row per unit.
 *
 *   tsx scripts/check-promotions.ts
 */
import assert from "node:assert/strict";

import { computePromotions } from "../src/lib/promotions";
import {
  bundleOrderLines,
  stripeProductName,
} from "../src/lib/orders/bundle-lines";

const order111 = [
  { unitCents: 3499, quantity: 1 },
  { unitCents: 3499, quantity: 1 },
  { unitCents: 3499, quantity: 2 },
  { unitCents: 3499, quantity: 2 },
  { unitCents: 3499, quantity: 1 },
  { unitCents: 2499, quantity: 1 },
];

const promo = computePromotions(order111);
assert.equal(promo.bundleActive, true);
assert.equal(promo.freeUnits, 4);
assert.equal(promo.discountCents, 12996);
assert.equal(promo.subtotalCents, 26992);

const stored = order111.flatMap((line, index) =>
  bundleOrderLines({
    grossUnitCents: line.unitCents,
    quantity: line.quantity,
    plan: promo.plans[index],
    bundleActive: promo.bundleActive,
  }),
);

assert.equal(
  stored.reduce((sum, row) => sum + row.quantity, 0),
  8,
);
assert.equal(
  stored.reduce((sum, row) => sum + row.unitCents * row.quantity, 0),
  26992,
);

const freeRows = stored.filter((row) => row.bundleFree);
assert.equal(
  freeRows.reduce((sum, row) => sum + row.quantity, 0),
  4,
);
assert.equal(
  freeRows.reduce((sum, row) => sum + row.unitCents * row.quantity, 0),
  12996,
);

const winnie = bundleOrderLines({
  grossUnitCents: 3499,
  quantity: 2,
  plan: promo.plans[2],
  bundleActive: true,
});
assert.deepEqual(winnie, [
  { quantity: 1, unitCents: 3499, bundleFree: false },
  { quantity: 1, unitCents: 3499, bundleFree: true },
]);

const airpods = bundleOrderLines({
  grossUnitCents: 3499,
  quantity: 2,
  plan: promo.plans[3],
  bundleActive: true,
});
assert.deepEqual(airpods, [
  { quantity: 2, unitCents: 3499, bundleFree: false },
]);

const bothFreePromo = computePromotions([
  { unitCents: 2499, quantity: 2 },
  { unitCents: 3499, quantity: 1 },
  { unitCents: 3499, quantity: 1 },
]);
assert.equal(bothFreePromo.plans[0].freeQty, 2);
assert.equal(bothFreePromo.plans[0].paidQty, 0);
assert.deepEqual(
  bundleOrderLines({
    grossUnitCents: 2499,
    quantity: 2,
    plan: bothFreePromo.plans[0],
    bundleActive: true,
  }),
  [
    { quantity: 1, unitCents: 2499, bundleFree: true },
    { quantity: 1, unitCents: 2499, bundleFree: true },
  ],
);

assert.deepEqual(
  bundleOrderLines({
    grossUnitCents: 2499,
    quantity: 1,
    plan: { paidQty: 0, freeQty: 1, unitCents: 2499 },
    bundleActive: true,
  }),
  [{ quantity: 1, unitCents: 2499, bundleFree: true }],
);

assert.deepEqual(
  bundleOrderLines({
    grossUnitCents: 3499,
    quantity: 2,
    plan: { paidQty: 1, freeQty: 0, unitCents: 3499 },
    bundleActive: true,
  }),
  [{ quantity: 2, unitCents: 3499, bundleFree: false }],
  "a plan that does not cover both units must not drop one",
);

const coupon = computePromotions(
  [{ unitCents: 3499, quantity: 2 }],
  "BESTIE10",
);
const couponRows = bundleOrderLines({
  grossUnitCents: 3499,
  quantity: 2,
  plan: coupon.plans[0],
  bundleActive: coupon.bundleActive,
});
assert.equal(coupon.bundleActive, false);
assert.deepEqual(couponRows, [
  { quantity: 2, unitCents: 3499, bundleFree: false },
]);

assert.equal(stripeProductName("Winnie case", false), "Winnie case");
assert.equal(stripeProductName("Winnie case", true), "Winnie case (Free)");
assert.notEqual(
  stripeProductName("Winnie case", false),
  stripeProductName("Winnie case", true),
);
assert.equal(stripeProductName("  Winnie case  ", true), "Winnie case (Free)");
const longName = "A".repeat(300);
assert.equal(stripeProductName(longName, true).length, 250);
assert.ok(stripeProductName(longName, true).endsWith(" (Free)"));
assert.equal(stripeProductName(longName, false).length, 250);

console.log("check-promotions: ok");

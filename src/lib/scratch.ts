/**
 * Scratch-card prize draw — SERVER ONLY.
 *
 * WHY THIS EXISTS
 * The announcement bar advertises BESTIE10 on every page, so the welcome
 * pop-up cannot buy an email address with it — you cannot trade someone
 * something they can already read at the top of the screen. The scratch card
 * pays out a *subscriber-only* tier instead, and every tier beats the public
 * 10%. That is the whole exchange: the address buys a better price.
 *
 * WHY THE DRAW LIVES ON THE SERVER
 * A prize picked in the browser is not a prize, it is a suggestion — open
 * devtools, re-roll until the jackpot appears. So the server draws, signs the
 * result into an httpOnly cookie, and later reads that same cookie to decide
 * which code to issue. The browser is only ever told *what it won*; it never
 * gets a say in it, and the reveal animation is pure theatre over a decision
 * that was already made.
 *
 * WHAT THIS DOES AND DOES NOT GUARANTEE
 * It guarantees the draw is honest and not re-rollable by casual tampering:
 * the cookie is httpOnly (JS cannot read or rewrite it) and HMAC-signed
 * (a hand-crafted `p25.whatever` fails verification). The amount is never sent
 * to the browser before an email is submitted, so there is nothing to read
 * ahead in the network tab and nothing to shop around for.
 *
 * It does NOT make a determined attacker unable to obtain 25% off, because the
 * payouts are *static shared codes* — once BESTIE25 exists, anyone who learns
 * the string can type it. That is an accepted trade for keeping checkout
 * stateless. Closing it properly means per-subscriber single-use codes and a
 * redemptions table that /api/checkout consults; see the note in
 * LOCAL_COUPONS for how tiers are retired if one ever leaks.
 */

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { resolveLocalCoupon, type LocalCoupon } from "@/lib/promotions";

/** Name of the httpOnly cookie carrying the signed draw. */
export const SCRATCH_COOKIE = "y2k_scratch";

/**
 * How long a drawn prize stays claimable. Matches the promo store's own 30-day
 * horizon so a code cannot outlive the bag that would apply it.
 */
export const SCRATCH_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

export type Prize = {
  /**
   * Stable identifier. This is what gets signed into the cookie, so renaming
   * an id invalidates every draw already sitting in a shopper's browser.
   */
  id: string;
  /** The coupon this tier pays out. Must exist in `LOCAL_COUPONS`. */
  couponCode: string;
  /** Relative odds weight. Not a percentage — the table is normalised on draw. */
  weight: number;
};

/**
 * The prize table. THIS IS THE MARGIN DIAL — the only place odds are set.
 *
 * Expected discount = Σ(weight × percentOff) / Σ(weight) ≈ 16.75%, against the
 * 10% every visitor can already help themselves to. So the modelled cost of an
 * email address is roughly 6.75 points of margin on that shopper's first order.
 * Tune the weights (or drop the 25% tier entirely) to move that number; nothing
 * else in the codebase needs to change.
 *
 * Every tier is a win. That is deliberate on two counts: a "you lost" state
 * poisons the moment you were trying to create, and a promotion where every
 * entrant receives something of value avoids being characterised as a lottery
 * in most jurisdictions (no consideration, no chance of loss).
 */
export const PRIZES: readonly Prize[] = [
  { id: "p15", couponCode: "BESTIE15", weight: 70 },
  { id: "p20", couponCode: "BESTIE20", weight: 25 },
  { id: "p25", couponCode: "BESTIE25", weight: 5 },
];

/** The coupon a prize pays out, or null if it has left the catalogue. */
export function prizeCoupon(prize: Prize): LocalCoupon | null {
  return resolveLocalCoupon(prize.couponCode);
}

/**
 * Tiers that can actually pay out.
 *
 * A prize pointing at a code that has been removed from the catalogue is
 * skipped rather than issued: handing over a smaller real discount is strictly
 * better than handing over a code checkout will reject.
 */
function payablePrizes(): Prize[] {
  return PRIZES.filter((p) => prizeCoupon(p) !== null && p.weight > 0);
}

/**
 * Draw a prize using the weighted table.
 *
 * Uses `crypto.randomInt` rather than `Math.random`: it is uniform over the
 * range with no modulo bias, which matters when one tier is deliberately rare.
 *
 * @returns null only if the table has no payable tiers at all — callers must
 *          fall back to the public coupon rather than issue nothing.
 */
export function drawPrize(): Prize | null {
  const pool = payablePrizes();
  if (pool.length === 0) return null;

  const total = pool.reduce((sum, p) => sum + p.weight, 0);
  let roll = randomInt(total); // 0 … total-1, uniform

  for (const prize of pool) {
    if (roll < prize.weight) return prize;
    roll -= prize.weight;
  }
  // Unreachable while the weights above sum to `total`; keeps the type honest.
  return pool[pool.length - 1];
}

function secret(): string {
  return process.env.BETTER_AUTH_SECRET || "y2kase-scratch-secret";
}

/**
 * Sign a prize id.
 *
 * The payload is namespaced so this MAC can never be confused with — or
 * replayed against — the unsubscribe tokens that share the same secret.
 */
function sign(prizeId: string): string {
  return createHmac("sha256", secret()).update(`scratch:${prizeId}`).digest("hex");
}

export function encodeScratchCookie(prize: Prize): string {
  return `${prize.id}.${sign(prize.id)}`;
}

/**
 * Recover the prize from a cookie, or null if it is absent, malformed, forged,
 * or names a tier that no longer exists.
 */
export function decodeScratchCookie(raw: string | undefined | null): Prize | null {
  if (!raw) return null;

  const dot = raw.lastIndexOf(".");
  if (dot <= 0 || dot === raw.length - 1) return null;

  const id = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  const expected = sign(id);

  // Length check first: timingSafeEqual throws on a mismatch, and a forged
  // cookie must produce a verdict rather than an exception.
  if (mac.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  } catch {
    return null;
  }

  return PRIZES.find((p) => p.id === id) ?? null;
}

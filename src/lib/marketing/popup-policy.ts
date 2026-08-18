/**
 * Marketing dialog frequency policy — the timings and caps, in one place.
 *
 * The pop-ups themselves read these numbers, and so does the admin "Fresh
 * visit" console, which tells a tester exactly how long to wait before the
 * welcome dialog appears. A QA tool that quotes a stale number is worse than
 * no QA tool at all: the tester concludes the pop-up is broken, and the real
 * regression is the one they stop looking for. Sharing the constant removes
 * that failure mode entirely.
 *
 * Dependency-free on purpose — imported from both client components and
 * server-rendered admin pages.
 */

const SECOND_MS = 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

export const WELCOME_POPUP_POLICY = {
  /** Browsing time on a discovery page before the offer is worth interrupting. */
  delayMs: 12 * SECOND_MS,
  /** One impression per shopper per week. */
  throttleMs: 7 * DAY_MS,
  /** Retired for good once the shopper has closed it this many times. */
  maxDismissals: 2,
} as const;

export const CART_RECOVERY_POLICY = {
  /** Desktop exit intent stays disarmed until the shopper has had time to orient. */
  exitArmDelayMs: 5 * SECOND_MS,
  /** Touch devices expose no exit signal, so fall back to respectful inactivity. */
  touchIdleDelayMs: 45 * SECOND_MS,
  /** One recovery impression per three days. */
  throttleMs: 3 * DAY_MS,
  /** How long the campaign stands down after `maxDismissals` refusals. */
  dismissalPauseMs: 30 * DAY_MS,
  maxDismissals: 3,
} as const;

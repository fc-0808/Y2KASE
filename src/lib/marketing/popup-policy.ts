/**
 * Marketing dialog policy — the timings and caps, in one place.
 *
 * The pop-ups themselves read these numbers, and so does the admin "Fresh
 * visit" console, which tells a tester exactly how long to wait before each
 * dialog appears. A QA tool that quotes a stale number is worse than no QA
 * tool at all: the tester concludes the pop-up is broken, and the real
 * regression is the one they stop looking for. Sharing the constant removes
 * that failure mode entirely.
 *
 * These are *policy* — when the storefront considers it acceptable to
 * interrupt someone. The mechanics of detecting the moment (pointer
 * trajectory, sampling windows, quirk suppression) belong to the detector in
 * `./exit-intent` and are deliberately not exposed here.
 *
 * Dependency-free on purpose — imported from both client components and
 * server-rendered admin pages.
 */

const SECOND_MS = 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

export const WELCOME_POPUP_POLICY = {
  /**
   * The longest a shopper waits before the offer arrives on its own.
   *
   * Six seconds clears the "did I land on the right site?" moment and still
   * lands inside the bulk of sessions. A longer wait does not buy a more
   * qualified audience; it just spends impressions on people who have already
   * left, and delays the code for everyone who has not.
   */
  delayMs: 6 * SECOND_MS,
  /**
   * Scrolling this far into a page is a stronger statement of interest than
   * any clock, so it short-circuits the wait rather than running alongside it.
   */
  scrollIntentRatio: 0.25,
  /**
   * Floor under the scroll trigger. A flick of the wheel in the first moment
   * after load is orientation, not intent, and interrupting it reads as an ad.
   */
  minDwellMs: 2.5 * SECOND_MS,
  /** One impression per shopper per week. */
  throttleMs: 7 * DAY_MS,
  /** Retired for good once the shopper has closed it this many times. */
  maxDismissals: 2,
} as const;

export const CART_RECOVERY_POLICY = {
  /** Exit intent stays disarmed until the shopper has had time to orient. */
  exitArmDelayMs: 3 * SECOND_MS,
  /** Touch devices expose no exit signal, so fall back to respectful inactivity. */
  touchIdleDelayMs: 45 * SECOND_MS,
  /** One recovery impression per three days. */
  throttleMs: 3 * DAY_MS,
  /** How long the campaign stands down after `maxDismissals` refusals. */
  dismissalPauseMs: 30 * DAY_MS,
  maxDismissals: 3,
} as const;

export const MARKETING_POPUP_POLICY = {
  /**
   * Quiet time between two *different* campaigns in one session, measured from
   * the moment the previous dialog left the screen rather than from when it
   * arrived — otherwise a shopper who reads one carefully is punished for it.
   *
   * A shopper who waves away the welcome offer and then fills a bag has
   * reached a genuinely new moment, and recovery is allowed to speak to it.
   * Twenty seconds is what separates that from a stack of two dialogs: long
   * enough that the second never lands on the heels of the first, short enough
   * that it cannot swallow an exit gesture, which by definition has no later.
   */
  handoverMs: 20 * SECOND_MS,
} as const;

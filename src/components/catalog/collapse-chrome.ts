/**
 * Decide whether the mobile catalog bar should tuck away.
 *
 * Scroll events are noisy: a finger rest jitters a few pixels, iOS rubber-bands
 * below zero, and the address bar collapsing jumps the scroll offset by a
 * large step that is not a shopper choosing a direction. The accumulator
 * requires a short run in one direction before the bar changes, and a jump
 * is ignored so the bar does not flicker.
 */
export const CHROME_SCROLL_THRESHOLD = 12;
export const CHROME_TOP_LOCK = 8;
export const CHROME_JUMP = 140;

export function stepCollapseChrome(
  hidden: boolean,
  acc: number,
  y: number,
  dy: number,
): { hidden: boolean; acc: number } {
  if (y <= CHROME_TOP_LOCK) return { hidden: false, acc: 0 };
  if (dy === 0 || Math.abs(dy) > CHROME_JUMP) return { hidden, acc: 0 };
  let next = acc;
  if ((dy > 0 && next < 0) || (dy < 0 && next > 0)) next = 0;
  next += dy;
  if (next > CHROME_SCROLL_THRESHOLD) return { hidden: true, acc: 0 };
  if (next < -CHROME_SCROLL_THRESHOLD) return { hidden: false, acc: 0 };
  return { hidden, acc: next };
}

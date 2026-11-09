/**
 * Decide whether the mobile catalog bar should tuck away.
 *
 * Scroll events are noisy: a finger rest jitters a few pixels, iOS rubber-bands
 * below zero, and the address bar collapsing jumps the scroll offset by a
 * large step that is not a shopper choosing a direction. A downward jump is
 * ignored so the bar does not flicker. An upward jump shows the bar, because
 * that is the shopper coming back.
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
  if (dy === 0) return { hidden, acc };
  // A large step down is the mobile browser chrome resizing, not a choice to
  // hide the bar. A large step up is the shopper coming back — show it.
  if (Math.abs(dy) > CHROME_JUMP) {
    return dy < 0 ? { hidden: false, acc: 0 } : { hidden, acc: 0 };
  }
  let next = acc;
  if ((dy > 0 && next < 0) || (dy < 0 && next > 0)) next = 0;
  next += dy;
  if (next > CHROME_SCROLL_THRESHOLD) return { hidden: true, acc: 0 };
  if (next < -CHROME_SCROLL_THRESHOLD) return { hidden: false, acc: 0 };
  return { hidden, acc: next };
}

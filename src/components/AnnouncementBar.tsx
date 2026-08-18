import { FREE_SHIPPING_OFFER } from "@/lib/pricing";
import { BUNDLE } from "@/lib/promotions";

/**
 * Both offers are DERIVED from the pricing and promotions engines rather than
 * retyped, so the bar can never advertise a threshold or a bundle that
 * checkout does not actually honour.
 */
const BUNDLE_OFFER = `Y2KASE Special: Buy ${BUNDLE.groupSize} Phone Cases—Pay For ${
  BUNDLE.groupSize - BUNDLE.freePerGroup
}`;

const OFFER_TEXT =
  "text-[11px] font-semibold leading-5 text-[var(--foreground)] md:text-xs";

/**
 * Holographic announcement bar. Server-rendered, no client JS.
 *
 * Desktop (`md+`): both offers on one centred line, separated by `|`.
 * Mobile: one offer at a time in a fixed-height slot, crossfading via CSS
 * (see `.announce-rotate` in globals.css). Pausable on hover/focus; freezes
 * on the first offer when `prefers-reduced-motion` is set.
 *
 * Both offers stay in the DOM so assistive tech can still reach them; the
 * visual rotator is the only thing that cycles.
 */
export function AnnouncementBar() {
  return (
    <div
      role="region"
      aria-label="Store promotions"
      className="bg-holo-shimmer border-b border-[var(--border)]"
    >
      {/* Mobile — single-line, one offer at a time */}
      <div className="announce-rotate relative mx-auto h-7 overflow-hidden px-4 md:hidden">
        <p
          className={`announce-rotate__a absolute inset-x-4 top-1/2 -translate-y-1/2 text-center ${OFFER_TEXT}`}
        >
          {FREE_SHIPPING_OFFER}
        </p>
        <p
          className={`announce-rotate__b absolute inset-x-4 top-1/2 -translate-y-1/2 text-center ${OFFER_TEXT}`}
        >
          {BUNDLE_OFFER}
        </p>
      </div>

      {/* Desktop — both offers, pipe-separated */}
      <p
        className={`mx-auto hidden max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-0 px-4 py-1 text-center md:flex ${OFFER_TEXT}`}
      >
        <span>{FREE_SHIPPING_OFFER}</span>
        <span aria-hidden="true" className="text-[var(--foreground)]/35">
          |
        </span>
        <span>{BUNDLE_OFFER}</span>
      </p>
    </div>
  );
}

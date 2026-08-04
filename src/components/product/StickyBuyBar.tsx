"use client";

/**
 * Sticky Add to Bag — the PDP's buy button, kept within thumb reach.
 *
 * A phone case carries three mandatory choices (generation, tier, style) plus
 * a gallery, so on a phone the real CTA is almost never on screen at the moment
 * a shopper decides. This bar mirrors it: same price, same disabled state, same
 * handler — it is a second view of one button, never a second code path.
 *
 * It appears only while the inline button is out of view, so the two are never
 * on screen together, and only below `lg`, where the two-column desktop layout
 * already keeps the real one visible. It also stands down whenever another
 * surface has taken over the bottom of the screen — the welcome pop-up, the
 * cart drawer it just opened — on the same terms as the support launcher.
 *
 * The bar reserves its height in `--bottom-bar-h` for as long as it is mounted
 * rather than only while shown. Publishing a height that changed on scroll
 * would reflow the document (and shove the footer around) every time the bar
 * slid in or out; a fixed reservation costs one screen-height of empty space
 * below the fold and nothing else.
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import { ShoppingBag, Check } from "lucide-react";
import { useCart } from "@/lib/store/cart";
import { useHasBlockingOverlay } from "@/lib/store/overlay";
import { cn, formatPrice } from "@/lib/utils";

export function StickyBuyBar({
  watch,
  price,
  currency,
  summary,
  disabled,
  added,
  onAdd,
}: {
  /** The inline Add to Bag button. The bar shows only while it's off screen. */
  watch: RefObject<HTMLElement | null>;
  price: number;
  currency: string;
  /** The current variation, e.g. "iPhone 17 Pro Max · Case Only". */
  summary: string;
  disabled: boolean;
  added: boolean;
  onAdd: () => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [scrolledPast, setScrolledPast] = useState(false);
  const cartOpen = useCart((state) => state.isOpen);
  const overlayActive = useHasBlockingOverlay();

  // Reading the persisted cart store can't desync hydration here: the bar is
  // parked until the observer fires, so the first client render matches the
  // server's regardless of what either of these say.
  const visible = scrolledPast && !cartOpen && !overlayActive;

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty("--bottom-bar-h", `${bar.offsetHeight}px`);

    publish();
    // Catches the desktop breakpoint (height drops to 0 when `lg:hidden`
    // applies) as well as a summary line that wraps on a narrow screen.
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--bottom-bar-h");
    };
  }, []);

  useEffect(() => {
    const target = watch.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) =>
      setScrolledPast(!entry.isIntersecting),
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [watch]);

  return (
    <div
      ref={barRef}
      // `inert` (not just aria-hidden) while parked off screen: the duplicate
      // button must not be reachable by tab or screen reader when it isn't
      // visible, or the page grows a phantom second CTA.
      inert={!visible}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--card)]/95 backdrop-blur-sm lg:hidden",
        "shadow-[0_-10px_30px_-20px_rgba(52,32,59,0.55)] transition-transform duration-300 motion-reduce:transition-none",
        visible ? "translate-y-0" : "translate-y-full",
      )}
    >
      <div className="flex items-center gap-3 px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-black leading-tight text-[var(--primary)]">
            {formatPrice(price, currency)}
          </p>
          <p className="truncate text-[11px] font-semibold text-[var(--foreground)]/70">
            {summary}
          </p>
        </div>
        <button
          onClick={onAdd}
          disabled={disabled}
          className="btn-candy flex shrink-0 items-center gap-2 px-6 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {added ? (
            <>
              <Check className="h-4 w-4" /> Added!
            </>
          ) : (
            <>
              <ShoppingBag className="h-4 w-4" /> Add to Bag
            </>
          )}
        </button>
      </div>
    </div>
  );
}

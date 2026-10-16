"use client";

/**
 * Mobile confirmation of the variation the shopper just chose.
 *
 * On a phone the gallery sits above the title and the option stack, so by the
 * time Style is on screen the photo it updates has already left the viewport.
 * Baymard's variant research is consistent on what happens next: people don't
 * notice an image change they can no longer see, and they won't scroll back
 * up to check. A second copy of the gallery would push Add to Bag off the
 * page; a floating thumbnail would sit on the sticky header, the buy bar, or
 * the help button.
 *
 * So this is one row, in the buy column, directly under the pickers and only
 * below `lg` (from `lg` up the gallery is already beside the options). The
 * photo is the style's own shot — the same one the cart thumbnail uses — and
 * it is the point of the row: frameless and large enough to read the artwork.
 *
 * The row is not itself a button. A chevron here reads as "collapse", and a
 * full-width hit target scrolls the shopper back to the gallery while they
 * are still comparing styles — the opposite of why the row exists. Only the
 * "View photos" control makes that trip, and it says so.
 */

import { useEffect, useState } from "react";
import { ProductMedia } from "@/components/ProductMedia";
import { cn } from "@/lib/utils";

export const PRODUCT_PHOTOS_ID = "product-photos";

const SWAP_MS = 220;

export function SelectedLookPreview({
  src,
  title,
  detail,
  onViewLarger,
  onImageError,
}: {
  src: string;
  /** The choice that changes the photo, usually the Style name. */
  title: string;
  /** The other chosen options, e.g. the device. */
  detail: string;
  onViewLarger: () => void;
  onImageError?: (url: string) => void;
}) {
  const spoken = [title, detail].filter(Boolean).join(", ");

  return (
    <figure
      className={cn(
        "flex w-full min-w-0 items-center gap-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] pr-4",
        "shadow-[0_12px_28px_-22px_rgba(255,62,165,0.9)]",
        "lg:hidden",
      )}
    >
      <PreviewPhoto src={src} onImageError={onImageError} />
      <figcaption className="min-w-0 flex-1 py-3">
        <span className="block text-xs font-bold text-[var(--foreground)]/60">
          Your look
        </span>
        {title ? (
          <span className="mt-1 block line-clamp-2 text-base font-black leading-tight text-[var(--foreground)]">
            {title}
          </span>
        ) : null}
        {detail ? (
          <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--foreground)]/55">
            {detail}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onViewLarger}
          aria-controls={PRODUCT_PHOTOS_ID}
          aria-label={spoken ? `View photos of ${spoken}` : "View photos"}
          className={cn(
            "mt-0.5 inline-flex min-h-11 items-center text-xs font-bold text-[var(--primary)]",
            "underline-offset-2 hover:underline",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
          )}
        >
          View photos
        </button>
      </figcaption>
    </figure>
  );
}

/**
 * Crossfades to the next variation shot. The outgoing frame stays mounted for
 * one animation so the thumb never blanks to the white well mid-tap.
 */
function PreviewPhoto({
  src,
  onImageError,
}: {
  src: string;
  onImageError?: (url: string) => void;
}) {
  const [shown, setShown] = useState(src);
  const [outgoing, setOutgoing] = useState<string | null>(null);
  // Portrait supplier frames are ~3:4. In a square they letterbox, which
  // leaves a white strip down the left of the well. Cover fills that frame.
  // Square shots stay contained so a cover crop doesn't slice them.
  const [fillFrame, setFillFrame] = useState(true);

  if (src !== shown) {
    setOutgoing(shown);
    setShown(src);
    setFillFrame(true);
  }

  useEffect(() => {
    if (!outgoing) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = window.setTimeout(() => setOutgoing(null), reduce ? 0 : SWAP_MS);
    return () => window.clearTimeout(id);
  }, [outgoing, shown]);

  function noteSize(size: { width: number; height: number }) {
    setFillFrame(size.height > size.width * 1.02);
  }

  return (
    <span className="relative block h-44 w-[8.25rem] shrink-0 overflow-hidden bg-[var(--product-surface)]">
      {outgoing ? (
        <span
          key={`out-${outgoing}`}
          className="style-preview-out pointer-events-none absolute inset-0"
        >
          <ProductMedia
            src={outgoing}
            alt=""
            fit={fillFrame ? "cover" : "contain"}
            sizes="132px"
            className="h-full w-full"
          />
        </span>
      ) : null}
      <span
        key={shown}
        className={cn("absolute inset-0", outgoing && "style-preview-in")}
      >
        <ProductMedia
          src={shown}
          alt=""
          fit={fillFrame ? "cover" : "contain"}
          sizes="132px"
          loading="lazy"
          className="h-full w-full"
          fallbackClassName="text-2xl"
          onLoad={noteSize}
          onImageError={onImageError}
        />
      </span>
    </span>
  );
}

"use client";

/**
 * CatalogBottomSheet — the mobile overlay for Filter and Sort.
 *
 * Shopify Dawn, Nike and Apple all put multi-facet refine behind a sheet
 * instead of a wrapping pill row: the grid stays on the first fold, thumbs
 * reach the actions, and the sheet can host a sticky "Show N products" footer
 * the wrapping dropdowns never could.
 *
 * Same dialog contract as the welcome pop and cart: scroll lock, focus trap,
 * Escape to dismiss, restore focus on close. z-index sits above the support
 * launcher so the chat bubble cannot cover the apply button.
 */

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useBodyScrollLock,
  useModalFocusTrap,
} from "@/lib/hooks/use-modal-dialog";

export function CatalogBottomSheet({
  open,
  onClose,
  title,
  footer,
  height = "auto",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  footer?: React.ReactNode;
  /** `full` for the filter accordion; `auto` for the three-item sort list. */
  height?: "auto" | "full";
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => {
      setDesktop(mq.matches);
      if (mq.matches && open) onClose();
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [onClose, open]);

  const active = open && !desktop;
  useBodyScrollLock(active);
  useModalFocusTrap(dialogRef, active, onClose);

  if (!active) return null;

  return (
    <div className="lg:hidden">
      <div
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px] animate-float-up"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "fixed inset-x-0 bottom-0 z-[61] flex flex-col rounded-t-3xl border border-[var(--border)] bg-[var(--card)] shadow-[0_-24px_60px_-24px_rgba(120,60,120,0.45)] animate-sheet-up",
          "focus:outline-none",
          height === "full"
            ? "h-[min(92dvh,40rem)]"
            : "max-h-[min(92dvh,40rem)]",
        )}
      >
        <div className="flex shrink-0 justify-center pt-2.5" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-[var(--border)]" />
        </div>

        <div className="flex shrink-0 items-center gap-3 px-4 pb-3 pt-1">
          <h2
            id={titleId}
            className="min-w-0 flex-1 text-lg font-black tracking-tight"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--muted)] text-[var(--foreground)]/60 transition hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-[var(--border)] bg-[var(--card)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

/**
 * The floating help button — our entire third-party chat footprint until a
 * shopper actually asks for a human.
 *
 * Hover and focus warm up the vendor's origins (a preconnect, no payload), so
 * the click that follows doesn't spend a round-trip on DNS and TLS. That's the
 * trade the facade pattern is built on: near-zero cost for everyone, near-zero
 * latency for the few who click.
 */

import type { Ref } from "react";
import { MessageCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type SupportLauncherProps = {
  ref?: Ref<HTMLButtonElement>;
  open: boolean;
  /** Unread agent replies awaiting a shopper who already started a chat. */
  unread: number;
  /** Id of the panel, referenced only while it exists in the DOM. */
  controls: string;
  onClick: () => void;
  onWarmUp: () => void;
};

export function SupportLauncher({
  ref,
  open,
  unread,
  controls,
  onClick,
  onWarmUp,
}: SupportLauncherProps) {
  const label =
    unread > 0
      ? `Support — ${unread} new ${unread === 1 ? "message" : "messages"}`
      : open
        ? "Close help"
        : "Need help?";

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      onPointerEnter={onWarmUp}
      onFocus={onWarmUp}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? controls : undefined}
      className={cn(
        "btn-candy pointer-events-auto relative grid h-14 w-14 place-items-center",
        "ring-2 ring-white sm:flex sm:w-auto sm:gap-2 sm:px-5",
      )}
    >
      {open ? (
        <X className="h-6 w-6 sm:h-5 sm:w-5" />
      ) : (
        <MessageCircle className="h-6 w-6 sm:h-5 sm:w-5" />
      )}
      <span className="hidden text-sm sm:inline">Help</span>

      {unread > 0 && !open && (
        <span
          aria-hidden
          className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full border-2 border-white bg-[var(--foreground)] px-1 text-xs font-black text-white"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}

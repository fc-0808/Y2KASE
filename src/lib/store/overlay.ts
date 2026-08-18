"use client";

/**
 * Blocking-overlay registry — one source of truth for "something already owns
 * the shopper's attention".
 *
 * The storefront floats several independent surfaces (welcome pop-up, cart
 * drawer, support widget) that all live in the bottom-right / bottom-center of
 * the viewport. Without coordination they stack on top of each other on small
 * screens, which is how you end up with a chat bubble sitting on a promo CTA.
 *
 * Rather than hand-tuning z-indexes and offsets — which breaks the moment any
 * of those panels changes height — each attention-grabbing surface claims the
 * lock while it is on screen, and lower-priority chrome simply stands down.
 *
 * Only surfaces that must not be competed with belong here. The cart drawer is
 * deliberately absent: it already exposes `isOpen` on the cart store, so
 * consumers read that directly.
 */

import { useEffect } from "react";
import { create } from "zustand";

type OverlayState = {
  /** Ids of the overlays currently displayed, in claim order. */
  active: string[];
  acquire: (id: string) => void;
  release: (id: string) => void;
};

export const useOverlayStore = create<OverlayState>()((set) => ({
  active: [],
  acquire: (id) =>
    set((s) => (s.active.includes(id) ? {} : { active: [...s.active, id] })),
  release: (id) =>
    set((s) =>
      s.active.includes(id)
        ? { active: s.active.filter((entry) => entry !== id) }
        : {},
    ),
}));

/** True while any registered overlay is asking for the shopper's attention. */
export function useHasBlockingOverlay(): boolean {
  return useOverlayStore((s) => s.active.length > 0);
}

/** True when a blocking surface other than `id` owns the viewport. */
export function useHasOtherBlockingOverlay(id: string): boolean {
  return useOverlayStore((state) =>
    state.active.some((activeId) => activeId !== id),
  );
}

/**
 * Hold the lock for exactly as long as `active` is true. Releasing on unmount
 * means a surface that disappears mid-animation can never strand the lock.
 */
export function useOverlayLock(id: string, active: boolean): void {
  const acquire = useOverlayStore((s) => s.acquire);
  const release = useOverlayStore((s) => s.release);

  useEffect(() => {
    if (!active) return;
    acquire(id);
    return () => release(id);
  }, [id, active, acquire, release]);
}

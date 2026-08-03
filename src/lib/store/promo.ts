"use client";

/**
 * Saved promo code — the bridge between a marketing surface that hands out a
 * discount and the bag that has to honour it.
 *
 * The welcome offer is no longer gated behind an email, so the pop-up reveals
 * the code on sight. Revealing a *string* still leaves the shopper with
 * homework: remember it, find the promo field on /cart, type it correctly. This
 * store removes that step — a surface saves the code once, and the cart picks
 * it up already applied.
 *
 * Deliberately separate from the cart store:
 *  - A code outlives any particular bag; it is usually saved before there are
 *    any items at all.
 *  - It is the only piece of storefront state that can silently expire or be
 *    retired out from under a returning visitor, so it gets its own lifecycle
 *    and its own storage key instead of complicating cart persistence.
 *
 * It never decides *pricing* — `computePromotions` remains the single source of
 * truth, and /api/checkout re-runs it server-side. This store only remembers
 * which code to feed it.
 *
 * HYDRATION: the server pass has no localStorage, so it always renders "no
 * code" while the client may restore one — a mismatch for any component that
 * paints the saved code during hydration. Every consumer must therefore sit
 * behind a mount guard, as /cart, the cart drawer and the pop-up all do.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { resolveLocalCoupon } from "@/lib/promotions";

const STORAGE_KEY = "y2kase-promo";

/**
 * How long a saved code stays live.
 *
 * Long enough to survive the gap between "saw the pop-up while browsing" and
 * "came back to buy" — the whole reason a code is a durable artefact — but not
 * so long that a bag silently discounts itself from a campaign the shopper met
 * a year ago.
 */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Where a saved code came from. Enumerated rather than a free string so the
 * value stays reportable, and so a hand-edited localStorage entry can be
 * rejected instead of leaking into analytics.
 */
const PROMO_SOURCES = ["welcome-popup", "welcome-gift", "manual"] as const;

export type PromoSource = (typeof PROMO_SOURCES)[number];

/** Outcome of an automatic (non-user-initiated) apply. */
export type AutoApplyOutcome =
  /** Saved — the bag now carries this code. */
  | "applied"
  /** This exact code was already saved; nothing changed. */
  | "already-saved"
  /** An equal-or-better code is already saved, so this one was declined. */
  | "superseded"
  /** Not a code the storefront redeems; nothing changed. */
  | "unknown-code";

type SavedPromo = {
  /** Canonical upper-cased code, e.g. "BESTIE10". Null when nothing is saved. */
  code: string | null;
  /** Epoch ms the code was saved, for expiry. Null when nothing is saved. */
  savedAt: number | null;
  /** Attribution for the surface that saved it. */
  source: PromoSource | null;
};

type PromoState = SavedPromo & {
  /**
   * Save a code the shopper typed themselves.
   *
   * An explicit action always wins — including over a better code — because
   * silently ignoring what someone just typed reads as a broken promo field.
   *
   * @returns false if the code is not redeemable (nothing was saved).
   */
  apply: (rawCode: string, source: PromoSource) => boolean;

  /**
   * Save a code on the shopper's behalf, from a marketing surface.
   *
   * Never downgrades: a shopper holding a better code (e.g. the retired
   * WELCOME15) must not lose value just because a 10% banner rendered.
   */
  autoApply: (rawCode: string, source: PromoSource) => AutoApplyOutcome;

  /** Forget the saved code — the shopper removed it in the bag. */
  clear: () => void;
};

const EMPTY: SavedPromo = { code: null, savedAt: null, source: null };

function asSource(value: unknown): PromoSource | null {
  return PROMO_SOURCES.includes(value as PromoSource)
    ? (value as PromoSource)
    : null;
}

/**
 * Is a saved entry still worth honouring?
 *
 * The one rule, applied at BOTH boundaries — when a persisted payload is
 * rehydrated, and again every time the code is read. Enforcing it twice is
 * deliberate: the read path is what feeds the checkout request, so it must not
 * depend on a rehydration hook having run correctly to stay safe.
 *
 * Guards three separate failure modes: a corrupt or hand-edited payload, a code
 * that has since been retired from the catalogue, and one that has simply aged
 * out. A future `savedAt` (clock skew) counts as fresh — voiding a real
 * discount over a wrong system clock is the worse outcome for the shopper.
 */
function isRedeemable(
  value: unknown,
): value is { code: string; savedAt: number } {
  if (!value || typeof value !== "object") return false;
  const { code, savedAt } = value as Partial<SavedPromo>;
  if (typeof code !== "string" || typeof savedAt !== "number") return false;
  if (!resolveLocalCoupon(code)) return false;
  return Date.now() - savedAt < MAX_AGE_MS;
}

/**
 * The code a bag should actually price against, or null.
 *
 * Split out from the hook so the rule is a plain function: no React, no store,
 * no hydration timing to reason about.
 */
export function selectSavedCode(value: {
  code: string | null;
  savedAt: number | null;
}): string | null {
  return isRedeemable(value) ? value.code : null;
}

export const usePromoStore = create<PromoState>()(
  persist(
    (set, get) => ({
      ...EMPTY,

      apply: (rawCode, source) => {
        const coupon = resolveLocalCoupon(rawCode);
        if (!coupon) return false;
        set({ code: coupon.code, savedAt: Date.now(), source });
        return true;
      },

      autoApply: (rawCode, source) => {
        const coupon = resolveLocalCoupon(rawCode);
        if (!coupon) return "unknown-code";

        const current = get().code;
        if (current === coupon.code) return "already-saved";

        const incumbent = resolveLocalCoupon(current);
        if (incumbent && incumbent.percentOff >= coupon.percentOff) {
          return "superseded";
        }

        set({ code: coupon.code, savedAt: Date.now(), source });
        return "applied";
      },

      clear: () => set({ ...EMPTY }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (s): SavedPromo => ({
        code: s.code,
        savedAt: s.savedAt,
        source: s.source,
      }),
      // Sanitise at the boundary so nothing downstream has to think about
      // expiry or retired codes: an entry that fails validation is dropped
      // during hydration and the store simply starts empty.
      merge: (persisted, current) =>
        isRedeemable(persisted)
          ? {
              ...current,
              code: persisted.code,
              savedAt: persisted.savedAt,
              source: asSource((persisted as Partial<SavedPromo>).source),
            }
          : current,
    },
  ),
);

/**
 * The code currently saved to the bag, or null if it has expired or been
 * retired from the catalogue.
 *
 * Subscribes to two primitives rather than a derived object, so the store can
 * never re-render a consumer on identity alone. Call only from a mounted client
 * component (see the hydration note at the top of this file).
 */
export function useSavedPromoCode(): string | null {
  const code = usePromoStore((s) => s.code);
  const savedAt = usePromoStore((s) => s.savedAt);
  return selectSavedCode({ code, savedAt });
}

/**
 * The store's actions. Each is selected individually — zustand action
 * identities are stable for the store's lifetime, so the destructured
 * functions are safe to list as effect dependencies.
 */
export function usePromoActions(): Pick<
  PromoState,
  "apply" | "autoApply" | "clear"
> {
  const apply = usePromoStore((s) => s.apply);
  const autoApply = usePromoStore((s) => s.autoApply);
  const clear = usePromoStore((s) => s.clear);
  return { apply, autoApply, clear };
}

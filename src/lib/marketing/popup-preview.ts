/**
 * Development-only pop-up overrides, parsed in one place.
 *
 * Both dialogs read the same `?popup=` parameter, and while each owned its own
 * string comparison the modes silently overlapped: the welcome pop-up treated
 * *any* value it did not recognise as "open me", so every new cart-recovery
 * mode opened both dialogs at once and neither could be reviewed on its own.
 * One parser and one exhaustive union make that class of bug unrepresentable.
 *
 * `process.env.NODE_ENV` is inlined at build time, so `readPopupPreview`
 * collapses to `() => null` in production and the whole override — including
 * the pop-ups' preview branches — drops out of the shipped bundle.
 */

export type PopupPreviewMode =
  /** `?popup=1` — open the welcome dialog immediately. */
  | "welcome"
  /** `?popup=cart` — open cart recovery immediately, no gesture needed. */
  | "cart"
  /**
   * `?popup=cart-exit` — a live rehearsal. Frequency caps and the arm delay
   * are lifted, but the real exit gesture is still required, which is the only
   * way to check the detector itself rather than the markup it renders.
   */
  | "cart-exit";

/**
 * Pure so `scripts/check-preview` can pin the mode table. Callers in the
 * browser want `readPopupPreview`, which adds the production guard.
 */
export function parsePopupPreview(search: string): PopupPreviewMode | null {
  const params = new URLSearchParams(search);
  if (params.get("cart-popup") === "1") return "cart";

  const value = params.get("popup");
  if (value === null) return null;
  if (value === "cart") return "cart";
  if (value === "cart-exit" || value === "cart-intent") return "cart-exit";
  return "welcome";
}

export function readPopupPreview(): PopupPreviewMode | null {
  if (process.env.NODE_ENV === "production") return null;
  if (typeof window === "undefined") return null;
  return parsePopupPreview(window.location.search);
}

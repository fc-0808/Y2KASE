/**
 * Session-level arbitration for marketing dialogs.
 *
 * Welcome capture and cart recovery are separate campaigns, but they must never
 * compete for attention in one browsing session. `sessionStorage` coordinates
 * remounts and client navigations; the in-memory fallback keeps the guarantee
 * when storage is blocked (private browsing policies, embedded browsers, etc.).
 */

export type MarketingPopupCampaign = "welcome" | "cart-recovery";

const SESSION_KEY = "y2k_marketing_popup_campaign";
let claimedInMemory: MarketingPopupCampaign | null = null;

function readSessionClaim(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function hasMarketingPopupClaim(): boolean {
  return claimedInMemory !== null || readSessionClaim() !== null;
}

/**
 * Atomically claims this tab's one marketing-dialog slot.
 *
 * JavaScript runs this check-and-set synchronously, so two independent trigger
 * handlers firing in the same event loop cannot both win.
 */
export function claimMarketingPopup(
  campaign: MarketingPopupCampaign,
): boolean {
  if (hasMarketingPopupClaim()) return false;

  claimedInMemory = campaign;
  try {
    window.sessionStorage.setItem(SESSION_KEY, campaign);
  } catch {
    // The module-level claim still protects this page lifecycle.
  }
  return true;
}

/**
 * Marketing interruptions belong on discovery pages, not account, consent,
 * authentication, legal, admin, or checkout surfaces.
 */
export function isMarketingPopupPath(pathname: string): boolean {
  const blockedPrefixes = [
    "/account",
    "/admin",
    "/cart",
    "/checkout",
    "/policies",
    "/sign-in",
    "/unsubscribe",
    "/welcome-gift",
  ];
  return !blockedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Session-level arbitration for marketing dialogs.
 *
 * Welcome capture and cart recovery are separate campaigns that must never
 * compete for attention. The first version of this enforced that with a single
 * boolean — one dialog per session, whoever asked first — and that turned out
 * to be a starvation bug rather than a policy.
 *
 * The welcome offer fires on a discovery page with an empty bag, which is
 * precisely the state of a shopper who has not added anything *yet*. It
 * therefore claimed the slot in nearly every session, and the campaign aimed
 * at shoppers who go on to fill a bag — the one attached to actual revenue —
 * could never run. The dialog was not broken; it had already lost a race it
 * was never told it was in.
 *
 * So the slot is ordered instead of first-come. A campaign may follow one of
 * strictly lower priority after a handover pause, and never the other way
 * round. Filling a bag is a genuinely new moment; seeing a welcome offer after
 * declining a cart reminder is just the same nagging in a different colour.
 *
 * `sessionStorage` carries the decision across remounts and reloads (it is
 * per-tab, so tabs arbitrate independently, which is what a shopper expects);
 * the in-memory copy keeps the guarantee when storage is blocked by private
 * browsing policies or an embedded browser.
 */

import { MARKETING_POPUP_POLICY } from "@/lib/marketing/popup-policy";

export type MarketingPopupCampaign = "welcome" | "cart-recovery";

const SESSION_KEY = "y2k_marketing_popup_campaign";

/** Higher wins. See the file comment for why recovery outranks welcome. */
const CAMPAIGN_PRIORITY: Record<MarketingPopupCampaign, number> = {
  welcome: 1,
  "cart-recovery": 2,
};

export type MarketingPopupClaim = {
  campaign: MarketingPopupCampaign;
  /** Epoch ms the campaign took the slot. */
  at: number;
  /** Epoch ms its dialog left the screen, once it has. */
  endedAt?: number;
};

let claimedInMemory: MarketingPopupClaim | null = null;

function isCampaign(value: unknown): value is MarketingPopupCampaign {
  return value === "welcome" || value === "cart-recovery";
}

/**
 * May `campaign` take a slot currently held by `held`?
 *
 * Pure, so the ordering can be pinned by `scripts/check-preview` rather than
 * inferred from behaviour in a browser.
 */
export function canFollowMarketingClaim(
  campaign: MarketingPopupCampaign,
  held: MarketingPopupClaim | null,
  now: number,
): boolean {
  if (!held) return true;
  // One impression per campaign per session, regardless of how much time has
  // passed — a shopper who closed a dialog has answered it.
  if (held.campaign === campaign) return false;
  if (CAMPAIGN_PRIORITY[campaign] <= CAMPAIGN_PRIORITY[held.campaign]) {
    return false;
  }
  // A dialog still on screen has not started its handover; the overlay lock is
  // what stops the two overlapping, and this is what stops them stacking.
  return now - (held.endedAt ?? held.at) >= MARKETING_POPUP_POLICY.handoverMs;
}

function readSessionClaim(): MarketingPopupClaim | null {
  if (typeof window === "undefined") return null;

  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  // Sessions opened before this key held a record stored the bare campaign
  // name. Reading them as claimed-long-ago releases the shoppers those
  // sessions had already locked out, without a migration.
  if (isCampaign(raw)) return { campaign: raw, at: 0 };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const { campaign, at, endedAt } = parsed as Partial<MarketingPopupClaim>;
    if (!isCampaign(campaign)) return null;
    return {
      campaign,
      at: typeof at === "number" && Number.isFinite(at) ? at : 0,
      endedAt:
        typeof endedAt === "number" && Number.isFinite(endedAt)
          ? endedAt
          : undefined,
    };
  } catch {
    // An unparseable value is treated as no claim. Jamming the slot shut on a
    // corrupt string would silence both campaigns for the whole session.
    return null;
  }
}

function currentClaim(): MarketingPopupClaim | null {
  return claimedInMemory ?? readSessionClaim();
}

function persistClaim(claim: MarketingPopupClaim): void {
  claimedInMemory = claim;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(claim));
  } catch {
    // The module-level claim still protects this page lifecycle.
  }
}

/** Would `claimMarketingPopup` succeed right now? Free of side effects. */
export function canClaimMarketingPopup(
  campaign: MarketingPopupCampaign,
  now: number = Date.now(),
): boolean {
  return canFollowMarketingClaim(campaign, currentClaim(), now);
}

/**
 * Atomically take this tab's marketing-dialog slot for `campaign`.
 *
 * JavaScript runs this check-and-set synchronously, so two trigger handlers
 * firing in the same event loop turn cannot both win.
 */
export function claimMarketingPopup(
  campaign: MarketingPopupCampaign,
  now: number = Date.now(),
): boolean {
  if (!canClaimMarketingPopup(campaign, now)) return false;
  persistClaim({ campaign, at: now });
  return true;
}

/**
 * Record that `campaign`'s dialog has left the screen.
 *
 * The slot stays held — one impression per campaign per session is the point —
 * but the handover for anything that may follow is measured from here. Calling
 * it for a campaign that does not hold the slot is a no-op, so the close path
 * never has to know whether it won the claim in the first place.
 */
export function releaseMarketingPopup(
  campaign: MarketingPopupCampaign,
  now: number = Date.now(),
): void {
  const held = currentClaim();
  if (!held || held.campaign !== campaign || held.endedAt !== undefined) return;
  persistClaim({ ...held, endedAt: now });
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

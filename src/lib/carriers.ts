/**
 * Carrier tracking helpers. A small registry so the admin only needs to enter a
 * tracking number + pick a carrier, and customers get a working "Track" link.
 */

export const CARRIERS = [
  "4PX",
  "USPS",
  "UPS",
  "FedEx",
  "DHL",
  "Royal Mail",
  "Canada Post",
  "Australia Post",
  "Hongkong Post",
  "SF Express",
  "Other",
] as const;

export type Carrier = (typeof CARRIERS)[number];

/**
 * The carrier every order ships with by default. 4PX is our fulfilment partner,
 * so the admin form and any automation should assume it unless overridden.
 */
export const DEFAULT_CARRIER: Carrier = "4PX";

const TEMPLATES: Record<string, (n: string) => string> = {
  // 4PX is a cross-border consolidator: its own portal is authoritative, but the
  // parcel is handed to a local post (USPS, Royal Mail, …) for last-mile. Admins
  // can paste a 17TRACK/Parcelsapp link in the Tracking URL field to override.
  "4PX": (n) => `https://track.4px.com/#/result/0/${n}`,
  USPS: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`,
  UPS: (n) => `https://www.ups.com/track?tracknum=${n}`,
  FedEx: (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}`,
  DHL: (n) => `https://www.dhl.com/en/express/tracking.html?AWB=${n}`,
  "Royal Mail": (n) => `https://www.royalmail.com/track-your-item#/tracking-results/${n}`,
  "Canada Post": (n) => `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${n}`,
  "Australia Post": (n) => `https://auspost.com.au/mypost/track/#/details/${n}`,
  "Hongkong Post": (n) => `https://www.hongkongpost.hk/en/mail_tracking/index.html?tracknumber=${n}`,
  "SF Express": (n) => `https://www.sf-express.com/we/ow/chn/en/waybill/list/${n}`,
};

/**
 * Resolve a tracking URL. An explicit URL always wins; otherwise we derive one
 * from the carrier + number. Returns null when nothing usable is available.
 */
export function trackingLink(
  carrier: string | null | undefined,
  number: string | null | undefined,
  explicitUrl?: string | null,
): string | null {
  if (explicitUrl && /^https?:\/\//i.test(explicitUrl)) return explicitUrl;
  if (!number) return null;
  const tpl = carrier ? TEMPLATES[carrier] : undefined;
  return tpl ? tpl(encodeURIComponent(number)) : null;
}

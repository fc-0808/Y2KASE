/**
 * Carrier tracking helpers. A small registry so the admin only needs to enter a
 * tracking number + pick a carrier, and customers get a working "Track" link.
 */

export const CARRIERS = [
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

const TEMPLATES: Record<string, (n: string) => string> = {
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

/**
 * Markets and published standard-delivery windows.
 *
 * Checkout, policy copy, support answers and merchant structured data all
 * consume this registry. A delivery promise must not be hand-maintained in
 * five places: that is how checkout and search markup drift apart.
 *
 * Published destinations are Western markets, with one 7–14 day window.
 * Hong Kong is accepted at checkout and is not named in shopper-facing copy.
 */
export const SHIPPING_REGIONS = [
  {
    label:
      "the United States, United Kingdom, Canada, Australia, New Zealand, Germany, France and the Netherlands",
    countries: ["US", "GB", "CA", "AU", "NZ", "DE", "FR", "NL"],
    minDays: 7,
    maxDays: 14,
  },
] as const;

export type ShippingRegion = (typeof SHIPPING_REGIONS)[number];
export type ShippingCountry = ShippingRegion["countries"][number];

/** Accepted at checkout, omitted from shipping copy. */
const UNLISTED_CHECKOUT_COUNTRIES = ["HK", "SG", "JP"] as const;

export const SHIPPING_COUNTRIES = [
  ...SHIPPING_REGIONS.flatMap((region) => [...region.countries]),
  ...UNLISTED_CHECKOUT_COUNTRIES,
] as const;

export const SHIPPING_MARKETS_SUMMARY = SHIPPING_REGIONS.map(
  (region) => region.label,
).join("; ");

/**
 * Public coverage line. The region list is where most orders go, not a closed
 * list of the only places we ship.
 */
export const SHIPPING_COVERAGE_SUMMARY = `We ship worldwide. Most orders go to ${SHIPPING_MARKETS_SUMMARY}.`;

export function shippingDays(region: ShippingRegion): string {
  return `${region.minDays}–${region.maxDays} days`;
}

const [west] = SHIPPING_REGIONS;

export const SHIPPING_ESTIMATE_SUMMARY =
  `Standard shipping takes ${shippingDays(west)} to the United States, United Kingdom, Canada, Australia, New Zealand, Germany, France and the Netherlands.`;

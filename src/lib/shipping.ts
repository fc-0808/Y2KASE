/**
 * Markets and published standard-delivery windows.
 *
 * Checkout, policy copy, support answers and merchant structured data all
 * consume this registry. A delivery promise must not be hand-maintained in
 * five places: that is how checkout and search markup drift apart.
 */
export const SHIPPING_REGIONS = [
  {
    label: "Hong Kong",
    countries: ["HK"],
    minDays: 1,
    maxDays: 3,
  },
  {
    label: "United States, United Kingdom, Germany, France and the Netherlands",
    countries: ["US", "GB", "DE", "FR", "NL"],
    minDays: 7,
    maxDays: 14,
  },
  {
    label: "Canada, Australia, Singapore, Japan and New Zealand",
    countries: ["CA", "AU", "SG", "JP", "NZ"],
    minDays: 10,
    maxDays: 21,
  },
] as const;

export type ShippingRegion = (typeof SHIPPING_REGIONS)[number];
export type ShippingCountry = ShippingRegion["countries"][number];

export const SHIPPING_COUNTRIES: readonly ShippingCountry[] =
  SHIPPING_REGIONS.flatMap((region) => [...region.countries]);

export const SHIPPING_MARKETS_SUMMARY = SHIPPING_REGIONS.map(
  (region) => region.label,
).join("; ");

export function shippingDays(region: ShippingRegion): string {
  return `${region.minDays}–${region.maxDays} days`;
}

const [hongKong, nearInternational, extendedInternational] = SHIPPING_REGIONS;

export const SHIPPING_ESTIMATE_SUMMARY =
  `Standard shipping takes ${shippingDays(hongKong)} within Hong Kong, ` +
  `${shippingDays(nearInternational)} to the US, UK, Germany, France and the Netherlands, ` +
  `and ${shippingDays(extendedInternational)} to Canada, Australia, Singapore, Japan and New Zealand.`;

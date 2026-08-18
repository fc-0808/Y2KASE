/**
 * Merchant-channel taxonomy.
 *
 * Google category 267 is specifically "Mobile Phone Cases". It must not be
 * stamped onto AirPods, tablet, laptop or watch products as those lines launch.
 * Omitting an optional category is safer than publishing a false one.
 */
const MOBILE_PHONE_CASE_TYPES = new Set([
  "iphone_case",
  "samsung_case",
  "pixel_case",
]);

export function googleProductCategoryId(
  productType: string,
): string | null {
  return MOBILE_PHONE_CASE_TYPES.has(productType) ? "267" : null;
}

/**
 * Merchant-channel taxonomy.
 *
 * Phone cases keep Google category 267 (the id this catalogue has always
 * published). AirPods cases use 505797 — Headphone & Headset Accessories —
 * so a live AirPods SKU is not stamped as a mobile phone case. Omitting an
 * optional category is safer than publishing a false one; unknown types
 * return null.
 */
const GOOGLE_PRODUCT_CATEGORY: Record<string, string> = {
  iphone_case: "267",
  samsung_case: "267",
  pixel_case: "267",
  airpod_case: "505797",
};

export function googleProductCategoryId(
  productType: string,
): string | null {
  return GOOGLE_PRODUCT_CATEGORY[productType] ?? null;
}

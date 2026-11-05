/**
 * Shipping rows for the Google product feed.
 *
 * Free listings stay disapproved until a product has a shipping price for
 * the country Google is matching. Checkout charges one rate, in the
 * product's currency, to every published destination, and drops it to zero
 * once the order clears the free-shipping threshold. The feed has to say
 * the same thing or the listing price will not match the product page.
 */
import { SHIPPING, shippingQuote } from "@/lib/pricing";
import {
  HANDLING_BUSINESS_DAYS,
  SHIPPING_REGIONS,
} from "@/lib/shipping";

export type MerchantShippingRate = {
  country: string;
  service: string;
  /** Major units plus currency code, as Merchant Center expects: "4.99 USD". */
  price: string;
  minHandlingDays: number;
  maxHandlingDays: number;
  minTransitDays: number;
  maxTransitDays: number;
};

export function merchantShippingRates(input: {
  price: string;
  currency: string;
}): MerchantShippingRate[] {
  const amount = Number(input.price);
  const currency = input.currency.toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0) return [];
  if (!(currency in SHIPPING)) return [];

  const quote = shippingQuote(currency, Math.round(amount * 100));
  const price = `${(quote.shippingCents / 100).toFixed(2)} ${currency}`;
  const [region] = SHIPPING_REGIONS;
  if (!region) return [];

  return region.countries.map((country) => ({
    country,
    service: "Standard",
    price,
    minHandlingDays: HANDLING_BUSINESS_DAYS.min,
    maxHandlingDays: HANDLING_BUSINESS_DAYS.max,
    minTransitDays: region.minDays,
    maxTransitDays: region.maxDays,
  }));
}

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
  iphone_duo_case: "267",
  samsung_case: "267",
  pixel_case: "267",
  airpod_case: "505797",
};

export function googleProductCategoryId(
  productType: string,
): string | null {
  return GOOGLE_PRODUCT_CATEGORY[productType] ?? null;
}

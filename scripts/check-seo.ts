/**
 * Pure SEO invariants — no network, database or credentials required.
 *
 * These checks guard the failure modes that are easy to reintroduce during
 * normal catalog work: page-2 canonical collapse, filter indexing, stale
 * search parameters, and structured-data prices drifting from the storefront.
 */
import assert from "node:assert/strict";
import type { ProductWithRelations, Review } from "../src/lib/db/schema";
import {
  absoluteUrl,
  catalogCanonicalHref,
  catalogPageMetadata,
  merchantReturnPolicyJsonLd,
  organizationJsonLd,
  productJsonLd,
  truncateDescription,
  websiteJsonLd,
} from "../src/lib/seo";
import type { CatalogParams } from "../src/lib/catalog/params";
import {
  SHIPPING_COUNTRIES,
  SHIPPING_REGIONS,
} from "../src/lib/shipping";
import { FREE_SHIPPING_OFFER } from "../src/lib/pricing";
import { googleProductCategoryId } from "../src/lib/catalog/merchant";
import { magsafeFacetHref } from "../src/lib/catalog/magsafe";
import {
  PRODUCTION_SITE_URL,
  shouldIndexSite,
} from "../src/lib/site";

assert.equal(new Set(SHIPPING_COUNTRIES).size, SHIPPING_COUNTRIES.length);
assert.deepEqual(
  SHIPPING_REGIONS.flatMap((region) => [...region.countries]),
  SHIPPING_COUNTRIES,
);
assert.match(
  FREE_SHIPPING_OFFER,
  /^Free standard shipping for orders over \S+/,
);
assert.equal(googleProductCategoryId("iphone_case"), "267");
assert.equal(googleProductCategoryId("airpod_case"), null);
assert.equal(magsafeFacetHref(true), "/collections/magsafe");
assert.equal(magsafeFacetHref(false), "/products?magsafe=false");
assert.equal(
  shouldIndexSite({
    vercelEnv: "production",
    nodeEnv: "production",
    siteUrl: PRODUCTION_SITE_URL,
  }),
  true,
);
assert.equal(
  shouldIndexSite({
    vercelEnv: "preview",
    nodeEnv: "production",
    siteUrl: PRODUCTION_SITE_URL,
  }),
  false,
);
assert.equal(
  shouldIndexSite({
    vercelEnv: "production",
    nodeEnv: "production",
    siteUrl: "https://preview.example.com",
  }),
  false,
);

const pageTwo: CatalogParams = {
  basePath: "/products",
  brands: [],
  sort: "newest",
  page: 2,
};
assert.equal(catalogCanonicalHref(pageTwo), "/products?page=2");
assert.equal(
  catalogPageMetadata({
    title: "Shop All",
    description: "Browse the catalog.",
    params: pageTwo,
  }).title,
  "Shop All — Page 2",
);

const filtered: CatalogParams = {
  ...pageTwo,
  q: "kuromi",
};
assert.equal(catalogCanonicalHref(filtered), "/products");
assert.equal(
  (catalogPageMetadata({
    title: "Shop All",
    description: "Browse the catalog.",
    params: filtered,
  }).robots as { index?: boolean }).index,
  false,
);

const website = websiteJsonLd() as {
  potentialAction: { target: { urlTemplate: string } };
};
assert.match(
  website.potentialAction.target.urlTemplate,
  /\/products\?q=\{search_term_string\}$/,
);

const organization = organizationJsonLd() as {
  "@type": string;
  hasMerchantReturnPolicy: { merchantReturnDays: number };
  hasShippingService: { shippingConditions: unknown[] };
};
assert.equal(organization["@type"], "OnlineStore");
assert.equal(
  organization.hasMerchantReturnPolicy.merchantReturnDays,
  30,
);
assert.equal(
  organization.hasShippingService.shippingConditions.length,
  SHIPPING_REGIONS.length,
);

const returnPolicy = merchantReturnPolicyJsonLd() as {
  merchantReturnLink: string;
  applicableCountry: string[];
};
assert.equal(
  returnPolicy.merchantReturnLink,
  absoluteUrl("/policies/refund-policy"),
);
assert.ok(returnPolicy.applicableCountry.includes("HK"));

const baseProduct = {
  id: 1,
  slug: "test-case",
  title: "Test Phone Case",
  description: "A visible product description.",
  price: "9.99",
  currency: "USD",
  materials: "TPU",
  status: "active",
  productType: "iphone_case",
  images: [{ url: "/brand/og.webp" }],
  options: [],
  variants: [],
} as unknown as ProductWithRelations;

const review = {
  authorName: "Customer",
  title: "Cute",
  body: "Exactly as pictured.",
  rating: 5,
  createdAt: new Date("2026-08-01T00:00:00Z"),
} as Review;

const product = productJsonLd(
  baseProduct,
  { count: 1, average: 5 },
  [review],
) as {
  offers: {
    "@type": string;
    price: string;
    shippingDetails: { hasShippingService: { "@id": string } };
  };
  review: unknown[];
};
assert.equal(product.offers["@type"], "Offer");
assert.equal(product.offers.price, "24.99");
assert.match(
  product.offers.shippingDetails.hasShippingService["@id"],
  /shipping-policy#standard-shipping$/,
);
assert.equal(product.review.length, 1);

const accessory = productJsonLd({
  ...baseProduct,
  productType: "phone_charm",
  price: "12.50",
} as ProductWithRelations) as { offers: { price: string } };
assert.equal(accessory.offers.price, "12.50");

const emojiText = "A".repeat(158) + " ✨ ending";
const truncated = truncateDescription(emojiText, 160);
assert.ok(!truncated.includes("\uFFFD"));
assert.ok(Array.from(truncated).length <= 161);

console.log("SEO invariants passed.");

/**
 * SEO — single source of truth for canonical URLs, brand identity and
 * Schema.org structured data (JSON-LD).
 *
 * Rich results are how a modern accessories brand (CASETiFY, Sonix, …) earns
 * price/rating/breadcrumb treatment in Google Search and feeds Merchant
 * Center / Shopping. Every builder here returns a plain object that is rendered
 * verbatim by the <JsonLd> component, so the markup stays type-checked and
 * impossible to desync from the page it describes.
 */

import type { Metadata } from "next";
import { SUPPORT_EMAIL } from "@/lib/legal";
import { getProductEntryPrice } from "@/lib/pricing";
import {
  buildCatalogHref,
  hasActiveFilters,
  DEFAULT_SORT,
  type CatalogParams,
} from "@/lib/catalog/params";
import type { ProductWithRelations, Review } from "@/lib/db/schema";
import { SHIPPING_COUNTRIES, SHIPPING_REGIONS } from "@/lib/shipping";
import { productTypeLabel } from "@/lib/catalog/product-types";
import {
  absoluteUrl,
  IS_INDEXABLE_DEPLOYMENT,
  SITE_NAME,
  SITE_URL,
} from "@/lib/site";

export { absoluteUrl, SITE_URL };

/** Brand identity — reused across structured data, OG tags and emails. */
export const BRAND = {
  name: SITE_NAME,
  legalName: SITE_NAME,
  description:
    "Kawaii, Y2K & holographic phone cases, charms and accessories. Express your vibe. ✨",
  logo: absoluteUrl("/brand/logo.png"),
  email: SUPPORT_EMAIL,
  /** Sameas profiles strengthen the brand's knowledge-graph entity. */
  sameAs: [
    "https://instagram.com/y2kase.co",
    "https://facebook.com/y2kase",
    "https://www.pinterest.com/y2kase",
    "https://www.tiktok.com/@y2kase",
  ],
} as const;

type JsonLdObject = Record<string, unknown>;

export const INDEXABLE_ROBOTS = {
  index: IS_INDEXABLE_DEPLOYMENT,
  follow: IS_INDEXABLE_DEPLOYMENT,
  noarchive: !IS_INDEXABLE_DEPLOYMENT,
  googleBot: {
    index: IS_INDEXABLE_DEPLOYMENT,
    follow: IS_INDEXABLE_DEPLOYMENT,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
} as const satisfies NonNullable<Metadata["robots"]>;

export const PRIVATE_PAGE_ROBOTS = {
  index: false,
  follow: false,
  noarchive: true,
  googleBot: { index: false, follow: false, noarchive: true },
} as const satisfies NonNullable<Metadata["robots"]>;

export const FACET_PAGE_ROBOTS = {
  index: false,
  follow: true,
  googleBot: {
    index: false,
    follow: true,
    "max-image-preview": "large",
  },
} as const satisfies NonNullable<Metadata["robots"]>;

/** Collapse whitespace and truncate at a word boundary without splitting emoji. */
export function truncateDescription(value: string, maxLength = 160): string {
  const clean = value.replace(/\s+/g, " ").trim();
  const points = Array.from(clean);
  if (points.length <= maxLength) return clean;

  const clipped = points.slice(0, maxLength + 1).join("");
  const boundary = clipped.lastIndexOf(" ");
  const safe = boundary >= Math.floor(maxLength * 0.65)
    ? clipped.slice(0, boundary)
    : points.slice(0, maxLength).join("");
  return `${safe.replace(/[,:;\-–—]+$/u, "").trimEnd()}…`;
}

/** Complete metadata for a canonical, indexable static page. */
export function publicPageMetadata(args: {
  title: string;
  description: string;
  path: string;
  /**
   * Bypass the root `%s · Y2KASE` title template. Homepage only — its title
   * already carries the brand, so applying the template would duplicate it.
   */
  absoluteTitle?: boolean;
}): Metadata {
  const description = truncateDescription(args.description);
  const imageAlt = args.absoluteTitle
    ? args.title
    : `${args.title} · Y2KASE`;
  return {
    title: args.absoluteTitle
      ? { absolute: args.title }
      : args.title,
    description,
    alternates: { canonical: args.path },
    openGraph: {
      type: "website",
      siteName: BRAND.name,
      locale: "en_US",
      title: args.title,
      description,
      url: args.path,
      images: [
        {
          url: "/brand/og.webp",
          width: 1200,
          height: 630,
          alt: imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: args.title,
      description,
      images: ["/brand/og.webp"],
    },
  };
}

/** Whether a catalog URL is an indexable member of the core pagination series. */
export function isIndexableCatalogPage(params: CatalogParams): boolean {
  return !hasActiveFilters(params) && params.sort === DEFAULT_SORT;
}

/** Canonical URL for a catalog state, following Google's pagination guidance. */
export function catalogCanonicalHref(params: CatalogParams): string {
  return isIndexableCatalogPage(params)
    ? buildCatalogHref(params)
    : params.basePath;
}

/** Shared metadata policy for products, collections and device result grids. */
export function catalogPageMetadata(args: {
  title: string;
  description: string;
  params: CatalogParams;
  /** null lets a colocated opengraph-image.tsx own the image field. */
  openGraphImage?: string | null;
}): Metadata {
  const indexable = isIndexableCatalogPage(args.params);
  const page = args.params.page;
  const paginated = indexable && page > 1;
  const canonical = catalogCanonicalHref(args.params);
  const title = paginated ? `${args.title} — Page ${page}` : args.title;
  const description = paginated
    ? truncateDescription(`${args.description} Page ${page}.`)
    : truncateDescription(args.description);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      siteName: BRAND.name,
      locale: "en_US",
      title,
      description,
      url: canonical,
      ...(args.openGraphImage === null
        ? {}
        : {
            images: [
              {
                url: args.openGraphImage ?? "/brand/og.webp",
                width: 1200,
                height: 630,
                alt: `${args.title} · Y2KASE`,
              },
            ],
          }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/brand/og.webp"],
    },
    ...(indexable ? {} : { robots: FACET_PAGE_ROBOTS }),
    ...(paginated
      ? {
          pagination: {
            previous:
              page === 2
                ? args.params.basePath
                : buildCatalogHref(args.params, { page: page - 1 }),
          },
        }
      : {}),
  };
}

export const MERCHANT_RETURN_POLICY_ANCHOR = "merchant-return-policy";
export const SHIPPING_SERVICE_ANCHOR = "standard-shipping";

const RETURN_POLICY_ID = absoluteUrl(
  `/policies/refund-policy#${MERCHANT_RETURN_POLICY_ANCHOR}`,
);
const SHIPPING_SERVICE_ID = absoluteUrl(
  `/policies/shipping-policy#${SHIPPING_SERVICE_ANCHOR}`,
);

function servicePeriod(minValue: number, maxValue: number): JsonLdObject {
  return {
    "@type": "ServicePeriod",
    duration: {
      "@type": "QuantitativeValue",
      minValue,
      maxValue,
      unitCode: "DAY",
    },
  };
}

function shippingDestinations(countries: readonly string[]): JsonLdObject[] {
  return countries.map((addressCountry) => ({
    "@type": "DefinedRegion",
    addressCountry,
  }));
}

/** Global 30-day policy, restricted to facts stated on the public policy page. */
export function merchantReturnPolicyJsonLd(): JsonLdObject {
  return {
    "@type": "MerchantReturnPolicy",
    "@id": RETURN_POLICY_ID,
    merchantReturnLink: absoluteUrl("/policies/refund-policy"),
    applicableCountry: [...SHIPPING_COUNTRIES],
    returnPolicyCategory:
      "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: 30,
    itemCondition: "https://schema.org/NewCondition",
    refundType: "https://schema.org/FullRefund",
  };
}

/** Global delivery policy matching the processing and transit times we publish. */
export function shippingServiceJsonLd(): JsonLdObject {
  return {
    "@type": "ShippingService",
    "@id": SHIPPING_SERVICE_ID,
    name: "Y2KASE standard shipping",
    description:
      "Tracked delivery to Y2KASE shipping markets, processed in 1–3 business days.",
    fulfillmentType: "https://schema.org/FulfillmentTypeDelivery",
    handlingTime: {
      ...servicePeriod(1, 3),
      businessDays: [
        "https://schema.org/Monday",
        "https://schema.org/Tuesday",
        "https://schema.org/Wednesday",
        "https://schema.org/Thursday",
        "https://schema.org/Friday",
      ],
    },
    shippingConditions: SHIPPING_REGIONS.map((region) => ({
      "@type": "ShippingConditions",
      shippingDestination: shippingDestinations(region.countries),
      transitTime: servicePeriod(region.minDays, region.maxDays),
    })),
  };
}

/**
 * OnlineStore entity. Emitted on the home page so search and answer engines can
 * disambiguate the merchant and connect its official policies and profiles.
 */
export function organizationJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": `${SITE_URL}/#organization`,
    name: BRAND.name,
    legalName: BRAND.legalName,
    url: SITE_URL,
    logo: BRAND.logo,
    description: BRAND.description,
    email: BRAND.email,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "Customer Service",
      email: BRAND.email,
      availableLanguage: "English",
    },
    areaServed: [...SHIPPING_COUNTRIES],
    sameAs: [...BRAND.sameAs],
    hasMerchantReturnPolicy: merchantReturnPolicyJsonLd(),
    hasShippingService: shippingServiceJsonLd(),
  };
}

/**
 * WebSite entity with the store's real search endpoint. Google retired the
 * visual Sitelinks Searchbox, but SearchAction remains useful machine-readable
 * site capability data for agents and other Schema.org consumers.
 */
export function websiteJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: BRAND.name,
    url: SITE_URL,
    inLanguage: "en",
    publisher: { "@id": `${SITE_URL}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/products?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** A single breadcrumb hop. `url` should be app-relative or absolute. */
export type Crumb = { name: string; url: string };

/** BreadcrumbList — renders the breadcrumb trail in search results. */
export function breadcrumbJsonLd(crumbs: Crumb[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.url),
    })),
  };
}

/** Generic public-page entity for About, Contact and policy surfaces. */
export function webPageJsonLd(args: {
  type?: "WebPage" | "AboutPage" | "ContactPage";
  name: string;
  description: string;
  url: string;
  mainEntity?: string;
}): JsonLdObject {
  const canonical = absoluteUrl(args.url);
  return {
    "@context": "https://schema.org",
    "@type": args.type ?? "WebPage",
    "@id": `${canonical}#webpage`,
    name: args.name,
    description: args.description,
    url: canonical,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    ...(args.mainEntity ? { mainEntity: { "@id": args.mainEntity } } : {}),
    inLanguage: "en",
  };
}

/** BlogPosting — article rich result + Google Discover eligibility. */
export function articleJsonLd(args: {
  title: string;
  description: string;
  url: string;
  image?: string | null;
  datePublished: string;
  dateModified?: string;
  author?: string;
}): JsonLdObject {
  const canonical = absoluteUrl(args.url);
  const author =
    !args.author || /y2kase/i.test(args.author)
      ? {
          "@type": "Organization",
          "@id": `${SITE_URL}/#organization`,
          name: BRAND.name,
          url: absoluteUrl("/about"),
        }
      : {
          "@type": "Person",
          name: args.author,
        };
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${canonical}#article`,
    headline: args.title,
    description: args.description,
    url: canonical,
    mainEntityOfPage: canonical,
    image: [
      args.image ? absoluteUrl(args.image) : absoluteUrl("/brand/og.webp"),
    ],
    datePublished: args.datePublished,
    dateModified: args.dateModified ?? args.datePublished,
    author,
    publisher: { "@id": `${SITE_URL}/#organization` },
    isPartOf: { "@id": `${SITE_URL}/#website` },
    inLanguage: "en",
  };
}

/**
 * FAQPage machine-readable Q&A.
 *
 * Google limits visible FAQ rich results to authoritative government/health
 * sites, so this is entity/context markup—not a promise of a special snippet.
 */
export function faqJsonLd(
  items: { question: string; answer: string }[],
): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.question,
      acceptedAnswer: { "@type": "Answer", text: i.answer },
    })),
  };
}

/**
 * The offer is the price initially visible on the PDP and in merchant feeds.
 * Bundle/add-on selectors can raise the price client-side, but marking a
 * standalone charm as the low price of a phone-case Product would be misleading.
 */
type SeoProduct = Omit<ProductWithRelations, "variants">;

function offerFor(product: SeoProduct): JsonLdObject {
  const currency = (product.currency || "USD").toUpperCase();
  const price = getProductEntryPrice(
    product.productType,
    product.price,
    currency,
  );

  return {
    "@type": "Offer",
    price: price.toFixed(2),
    priceCurrency: currency,
    availability:
      product.status === "active"
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    url: absoluteUrl(`/products/${product.slug}`),
    seller: { "@id": `${SITE_URL}/#organization` },
    itemCondition: "https://schema.org/NewCondition",
    hasMerchantReturnPolicy: { "@id": RETURN_POLICY_ID },
    shippingDetails: {
      "@type": "OfferShippingDetails",
      hasShippingService: { "@id": SHIPPING_SERVICE_ID },
    },
  };
}

/** Minimal rating summary needed for aggregateRating. */
export type RatingSummary = { count: number; average: number };

/**
 * Product entity for a PDP — the highest-value structured data on the site.
 * Powers price, availability and review (star) rich results, and is the basis
 * for a Merchant Center feed. `aggregateRating` is emitted ONLY when at least
 * one published review exists — Google's policy forbids rating markup without
 * genuine, on-page reviews.
 */
export function productJsonLd(
  product: SeoProduct,
  rating?: RatingSummary,
  reviews: Review[] = [],
): JsonLdObject {
  const images = product.images
    .map((i) => i.url)
    .filter((u): u is string => Boolean(u));
  const canonical = absoluteUrl(`/products/${product.slug}`);
  const description = product.description?.trim();

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${canonical}#product`,
    url: canonical,
    mainEntityOfPage: canonical,
    name: product.title,
    ...(description ? { description } : {}),
    image:
      images.length > 0
        ? images.map((image) => absoluteUrl(image))
        : [BRAND.logo],
    sku: product.slug,
    category: productTypeLabel(product.productType),
    ...(product.materials ? { material: product.materials } : {}),
    brand: { "@type": "Brand", name: BRAND.name },
    offers: offerFor(product),
    ...(rating && rating.count > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: rating.average.toFixed(1),
            reviewCount: rating.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    ...(reviews.length > 0
      ? {
          review: reviews.map((review) => ({
            "@type": "Review",
            author: { "@type": "Person", name: review.authorName },
            datePublished: new Date(review.createdAt).toISOString(),
            ...(review.title ? { name: review.title } : {}),
            reviewBody: review.body,
            reviewRating: {
              "@type": "Rating",
              ratingValue: review.rating,
              bestRating: 5,
              worstRating: 1,
            },
          })),
        }
      : {}),
  };
}

/**
 * Dataset entity for a first-party catalog snapshot. Paired with a visible
 * methods section on the Insights page so the numbers are not orphaned
 * machine-readable claims.
 */
export function datasetJsonLd(args: {
  name: string;
  description: string;
  url: string;
  dateModified: string;
  variables: string[];
}): JsonLdObject {
  const canonical = absoluteUrl(args.url);
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "@id": `${canonical}#dataset`,
    name: args.name,
    description: args.description,
    url: canonical,
    creator: { "@id": `${SITE_URL}/#organization` },
    publisher: { "@id": `${SITE_URL}/#organization` },
    dateModified: args.dateModified,
    isAccessibleForFree: true,
    variableMeasured: args.variables,
    inLanguage: "en",
  };
}

/**
 * CollectionPage entity describing a curated browse page and the products it
 * lists (as an ItemList of URLs).
 */
export function collectionPageJsonLd(args: {
  name: string;
  description?: string | null;
  url: string;
  items: { name: string; url: string }[];
}): JsonLdObject {
  const canonical = absoluteUrl(args.url);
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${canonical}#collection`,
    name: args.name,
    ...(args.description ? { description: args.description } : {}),
    url: canonical,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    inLanguage: "en",
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: args.items.length,
      itemListElement: args.items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.name,
        url: absoluteUrl(item.url),
      })),
    },
  };
}

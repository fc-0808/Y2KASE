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

import { SUPPORT_EMAIL } from "@/lib/legal";
import {
  STYLE_OPTION_NAME,
  orderStyles,
  getStylePrice,
} from "@/lib/pricing";
import type { ProductWithRelations } from "@/lib/db/schema";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

/** Turn an app-relative path into an absolute, canonical URL. */
export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Brand identity — reused across structured data, OG tags and emails. */
export const BRAND = {
  name: "Y2KASE",
  legalName: "Y2KASE",
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

/**
 * Organization entity. Emitted once site-wide so Google can build a brand
 * knowledge panel and associate reviews, logo and social profiles.
 */
export function organizationJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: BRAND.name,
    legalName: BRAND.legalName,
    url: SITE_URL,
    logo: BRAND.logo,
    description: BRAND.description,
    email: BRAND.email,
    sameAs: [...BRAND.sameAs],
  };
}

/**
 * WebSite entity with a Sitelinks Searchbox action, wiring Google's in-SERP
 * search box straight to our /products?search= endpoint.
 */
export function websiteJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: BRAND.name,
    url: SITE_URL,
    publisher: { "@id": `${SITE_URL}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/products?search={search_term_string}`,
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

/** BlogPosting — article rich result + Google Discover eligibility. */
export function articleJsonLd(args: {
  title: string;
  description: string;
  url: string;
  image?: string | null;
  datePublished: string;
  author?: string;
}): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: args.title,
    description: args.description,
    url: absoluteUrl(args.url),
    mainEntityOfPage: absoluteUrl(args.url),
    image: args.image ? [absoluteUrl(args.image)] : [BRAND.logo],
    datePublished: args.datePublished,
    dateModified: args.datePublished,
    author: { "@type": "Organization", name: args.author ?? BRAND.name },
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

/** FAQPage — eligible for the expandable FAQ rich result. */
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
 * Compute the offer price range for a product. Because price is driven by the
 * selected Style (Case Only → Case + Grip + Charm), a product with multiple
 * styles is an AggregateOffer spanning the cheapest to the most complete build;
 * a single-style product is a flat Offer. Falls back to the stored price.
 */
function offerFor(product: ProductWithRelations): JsonLdObject {
  const currency = (product.currency || "USD").toUpperCase();
  const availability =
    product.status === "active"
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock";

  const styleOpt = product.options.find((o) => o.name === STYLE_OPTION_NAME);
  const styles = orderStyles(styleOpt?.values ?? []);

  const base: JsonLdObject = {
    priceCurrency: currency,
    availability,
    url: absoluteUrl(`/products/${product.slug}`),
    seller: { "@id": `${SITE_URL}/#organization` },
    itemCondition: "https://schema.org/NewCondition",
  };

  if (styles.length > 1) {
    const prices = styles.map((s) => getStylePrice(s, currency));
    return {
      "@type": "AggregateOffer",
      offerCount: styles.length,
      lowPrice: Math.min(...prices).toFixed(2),
      highPrice: Math.max(...prices).toFixed(2),
      ...base,
    };
  }

  const price = Number(product.price);
  return {
    "@type": "Offer",
    price: (Number.isFinite(price) ? price : 0).toFixed(2),
    ...base,
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
  product: ProductWithRelations,
  rating?: RatingSummary,
): JsonLdObject {
  const images = product.images
    .map((i) => i.url)
    .filter((u): u is string => Boolean(u));

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": absoluteUrl(`/products/${product.slug}#product`),
    name: product.title,
    description: product.description?.trim() || BRAND.description,
    image: images.length > 0 ? images : [BRAND.logo],
    sku: product.slug,
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
  productUrls: string[];
}): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: args.name,
    ...(args.description ? { description: args.description } : {}),
    url: absoluteUrl(args.url),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: args.productUrls.length,
      itemListElement: args.productUrls.map((url, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: absoluteUrl(url),
      })),
    },
  };
}

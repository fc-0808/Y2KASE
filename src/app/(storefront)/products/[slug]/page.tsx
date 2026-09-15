import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductBySlug } from "@/lib/products";
import { JsonLd } from "@/components/JsonLd";
import {
  BRAND,
  breadcrumbJsonLd,
  productJsonLd,
  truncateDescription,
} from "@/lib/seo";
import { productSerpTitle } from "@/lib/seo/copy";
import { getProductEntryPrice } from "@/lib/pricing";
import { SHIPPING_COUNTRIES } from "@/lib/shipping";
import { liveProductPageHref } from "@/lib/catalog/product-page";
import {
  loadProductPageCompanionData,
  ProductPageView,
} from "@/components/product/ProductPageView";

export const revalidate = 3600; // ISR: refresh product pages hourly.

/**
 * Generate product pages on first request, then keep them in the Full Route
 * Cache. Next.js requires an array (including an empty one) for runtime ISR of
 * dynamic paths; without this, the existing `revalidate` never cached PDP HTML.
 */
export function generateStaticParams(): { slug: string }[] {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };

  const description = truncateDescription(
    product.description?.trim() || BRAND.description,
  );
  const canonical = liveProductPageHref(product.slug);

  // Use the real product hero image for og:image — this is what Pinterest,
  // Facebook and iMessage show when the page is saved/shared, and a true
  // product photo dramatically out-converts a generic branded card.
  const heroImage = product.images[0]?.url;

  return {
    title: productSerpTitle(product.title),
    description,
    alternates: { canonical },
    openGraph: {
      siteName: BRAND.name,
      locale: "en_US",
      title: product.title,
      description,
      url: canonical,
      ...(heroImage
        ? { images: [{ url: heroImage, alt: product.title }] }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: product.title,
      description,
      ...(heroImage ? { images: [heroImage] } : {}),
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const { relatedProducts, reviewSummary, reviews, collectionLinks } =
    await loadProductPageCompanionData(product);
  const currency = (product.currency || "USD").toUpperCase();
  const entryPrice = getProductEntryPrice(
    product.productType,
    product.price,
    currency,
  );

  return (
    <>
      <ProductOpenGraphMeta
        price={entryPrice}
        currency={currency}
        availability={product.status === "active" ? "instock" : "out of stock"}
      />
      <JsonLd
        data={[
          productJsonLd(product, reviewSummary, reviews),
          breadcrumbJsonLd([
            { name: "Home", url: "/" },
            { name: "Shop", url: "/products" },
            { name: product.title, url: liveProductPageHref(product.slug) },
          ]),
        ]}
      />
      <ProductPageView
        product={product}
        reviewSummary={reviewSummary}
        reviews={reviews}
        collectionLinks={collectionLinks}
        relatedProducts={relatedProducts}
      />
    </>
  );
}

/**
 * Next's generic `metadata.other` emits `name=`, but Open Graph product fields
 * require `property=`. React 19 hoists these server-rendered metadata elements
 * into <head>, preserving standards-compliant Pinterest/Facebook Rich Pins.
 */
function ProductOpenGraphMeta({
  price,
  currency,
  availability,
}: {
  price: number;
  currency: string;
  availability: "instock" | "out of stock";
}) {
  return (
    <>
      <meta property="og:type" content="product" />
      <meta property="product:price:amount" content={price.toFixed(2)} />
      <meta property="product:price:currency" content={currency} />
      <meta property="og:availability" content={availability} />
      {SHIPPING_COUNTRIES.map((country) => (
        <meta
          key={country}
          property="og:availability:destinations"
          content={country}
        />
      ))}
      <meta property="product:brand" content={BRAND.name} />
    </>
  );
}

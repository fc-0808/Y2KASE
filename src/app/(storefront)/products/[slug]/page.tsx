import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import {
  getProductBySlug,
  getRelatedProducts,
  type ProductListItem,
} from "@/lib/products";
import { getReviewSummary, getPublishedReviews } from "@/lib/reviews";
import { ProductDetailClient } from "@/components/ProductDetailClient";
import { ProductReviews } from "@/components/reviews/ProductReviews";
import { ProductCard } from "@/components/ProductCard";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { SocialShare } from "@/components/SocialShare";
import { JsonLd } from "@/components/JsonLd";
import {
  BRAND,
  breadcrumbJsonLd,
  productJsonLd,
  truncateDescription,
} from "@/lib/seo";
import { getProductEntryPrice } from "@/lib/pricing";
import { SITE_URL } from "@/lib/site";
import { SHIPPING_COUNTRIES } from "@/lib/shipping";

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
  const canonical = `/products/${product.slug}`;

  // Use the real product hero image for og:image — this is what Pinterest,
  // Facebook and iMessage show when the page is saved/shared, and a true
  // product photo dramatically out-converts a generic branded card.
  const heroImage = product.images[0]?.url;

  return {
    title: truncateDescription(product.title, 62),
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

  const relatedPromise = getRelatedProducts({
    productId: product.id,
    productType: product.productType,
  }).catch((error) => {
    console.error("[product-page] related products unavailable:", error);
    return [];
  });
  const [reviewSummary, reviews] = await Promise.all([
    getReviewSummary(product.id),
    getPublishedReviews(product.id),
  ]);
  const currency = (product.currency || "USD").toUpperCase();
  const entryPrice = getProductEntryPrice(
    product.productType,
    product.price,
    currency,
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
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
            { name: product.title, url: `/products/${product.slug}` },
          ]),
        ]}
      />
      <nav
        aria-label="Breadcrumb"
        className="mb-6 flex min-w-0 items-center gap-1 text-sm text-[var(--foreground)]/60"
      >
        <Link href="/" className="shrink-0 hover:text-[var(--primary)]">
          Home
        </Link>
        <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <Link
          href="/products"
          className="shrink-0 hover:text-[var(--primary)]"
        >
          Shop
        </Link>
        <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <span
          aria-current="page"
          className="truncate font-semibold text-[var(--foreground)]"
        >
          {product.title}
        </span>
      </nav>

      <ProductDetailClient
        productId={product.id}
        slug={product.slug}
        title={product.title}
        price={Number(product.price)}
        compareAtPrice={
          product.compareAtPrice ? Number(product.compareAtPrice) : null
        }
        currency={product.currency}
        productType={product.productType}
        ratingAverage={reviewSummary.average}
        ratingCount={reviewSummary.count}
        videoUrl={product.videoUrl}
        videoPosition={product.videoPosition}
        images={product.images.map((i) => ({
          id: i.id,
          url: i.url,
          altText: i.altText,
          styleTags: i.styleTags ?? [],
        }))}
        options={product.options.map((o) => ({
          id: o.id,
          name: o.name,
          values: o.values,
        }))}
      />

      {product.description && (
        <section className="mt-12 max-w-3xl">
          <h2 className="mb-3 text-xl font-black">Details</h2>
          <div className="whitespace-pre-line leading-relaxed text-[var(--foreground)]/80">
            {product.description}
          </div>
          {product.materials && (
            <p className="mt-4 text-sm text-[var(--foreground)]/60">
              <span className="font-semibold">Materials:</span>{" "}
              {product.materials}
            </p>
          )}
        </section>
      )}

      {/* Social sharing — Pinterest Save + copy link for organic virality */}
      <div className="mt-8">
        <SocialShare
          url={`${SITE_URL}/products/${product.slug}`}
          title={product.title}
          imageUrl={product.images[0]?.url ?? undefined}
        />
      </div>

      {product.tags.length > 0 && (
        <section className="mt-8 flex flex-wrap gap-2">
          {product.tags.map((tag) => (
            <Link
              key={tag}
              href={`/products?tag=${encodeURIComponent(tag)}`}
              className="rounded-full bg-[var(--muted)] px-3 py-1 text-xs font-semibold capitalize text-[var(--primary)]"
            >
              {tag.replace(/_/g, " ")}
            </Link>
          ))}
        </section>
      )}

      <Suspense fallback={<RelatedProductsSkeleton />}>
        <RelatedProducts products={relatedPromise} />
      </Suspense>

      <ProductReviews
        productId={product.id}
        slug={product.slug}
        summary={reviewSummary}
        reviews={reviews}
      />

      <RecentlyViewed
        current={{
          id: product.id,
          slug: product.slug,
          title: product.title,
          price: product.price,
          compareAtPrice: product.compareAtPrice,
          currency: product.currency,
          imageUrl: product.images[0]?.url ?? null,
        }}
      />
    </div>
  );
}

async function RelatedProducts({
  products,
}: {
  products: Promise<ProductListItem[]>;
}) {
  const related = await products;
  if (related.length === 0) return null;

  return (
    <section className="mt-16">
      <h2 className="mb-5 text-xl font-black">You may also like</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {related.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}

function RelatedProductsSkeleton() {
  return (
    <section className="mt-16" aria-hidden>
      <div className="mb-5 h-7 w-44 animate-pulse rounded bg-[var(--muted)]" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="aspect-[2/3] animate-pulse rounded-3xl bg-[var(--muted)] md:aspect-[4/5]"
          />
        ))}
      </div>
    </section>
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

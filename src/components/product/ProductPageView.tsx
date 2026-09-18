import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight } from "lucide-react";
import {
  getRelatedProducts,
  type ProductListItem,
  type StorefrontProduct,
} from "@/lib/products";
import {
  getPublishedReviews,
  getReviewSummary,
  type ReviewSummary,
} from "@/lib/reviews";
import type { Review } from "@/lib/db/schema";
import { ProductDetailClient } from "@/components/ProductDetailClient";
import { ProductReviews } from "@/components/reviews/ProductReviews";
import {
  ProductCard,
  PRODUCT_CARD_FRAME,
  PRODUCT_MOSAIC,
} from "@/components/ProductCard";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { SocialShare } from "@/components/SocialShare";
import { collectionHeading } from "@/lib/seo/copy";
import { SITE_URL } from "@/lib/site";
import {
  getProductCollectionLinks,
  type StorefrontCollectionLink,
} from "@/lib/collections";
import { MAGSAFE_TAG, magsafeFacetHref } from "@/lib/catalog/magsafe";
import { liveProductPageHref } from "@/lib/catalog/product-page";

export type ProductPageCompanionData = {
  relatedProducts: Promise<ProductListItem[]>;
  reviewSummary: ReviewSummary;
  reviews: Review[];
  collectionLinks: StorefrontCollectionLink[];
};

/**
 * Reviews, collections and related products shared by the public PDP and the
 * admin draft preview. Keeping the loader in one place means a new companion
 * query cannot silently exist on only one of those surfaces.
 */
export async function loadProductPageCompanionData(product: {
  id: number;
  productType: string;
}): Promise<ProductPageCompanionData> {
  const relatedProducts = getRelatedProducts({
    productId: product.id,
    productType: product.productType,
  }).catch((error) => {
    console.error("[product-page] related products unavailable:", error);
    return [];
  });
  const [reviewSummary, reviews, collectionLinks] = await Promise.all([
    getReviewSummary(product.id),
    getPublishedReviews(product.id),
    getProductCollectionLinks(product.id).catch((error) => {
      console.error("[product-page] collection links unavailable:", error);
      return [];
    }),
  ]);
  return { relatedProducts, reviewSummary, reviews, collectionLinks };
}

/**
 * The shopper product page body.
 *
 * `surface` switches shopper-only chrome (JSON-LD lives on the public route;
 * this flag drops share + recently-viewed + commerce pixels) so a draft preview
 * can reuse the exact PDP without leaking unpublished URLs into social widgets
 * or first-party analytics.
 */
export function ProductPageView({
  product,
  reviewSummary,
  reviews,
  collectionLinks,
  relatedProducts,
  surface = "storefront",
}: {
  product: StorefrontProduct;
  reviewSummary: ReviewSummary;
  reviews: Review[];
  collectionLinks: StorefrontCollectionLink[];
  relatedProducts: Promise<ProductListItem[]>;
  surface?: "storefront" | "preview";
}) {
  const isPreview = surface === "preview";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
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
        trackCommerce={!isPreview}
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

      {collectionLinks.length > 0 && (
        <section className="mt-10 max-w-3xl">
          <h2 className="mb-3 text-xl font-black">Shop this look</h2>
          <nav aria-label="Related collections" className="flex flex-wrap gap-2">
            {collectionLinks.map((link) => (
              <Link
                key={link.slug}
                href={`/collections/${link.slug}`}
                className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3.5 py-1.5 text-sm font-semibold shadow-sm transition hover:border-[var(--primary)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
              >
                {collectionHeading(link.name, link.slug)}
              </Link>
            ))}
          </nav>
        </section>
      )}

      {!isPreview && (
        <div className="mt-8">
          <SocialShare
            url={`${SITE_URL}${liveProductPageHref(product.slug)}`}
            title={product.title}
            imageUrl={product.images[0]?.url ?? undefined}
          />
        </div>
      )}

      {product.tags.length > 0 && (
        <section className="mt-8 flex flex-wrap gap-2">
          {product.tags.map((tag) => (
            <Link
              key={tag}
              href={
                tag === MAGSAFE_TAG
                  ? magsafeFacetHref(true)
                  : `/products?tag=${encodeURIComponent(tag)}`
              }
              className="rounded-full bg-[var(--muted)] px-3 py-1 text-xs font-semibold capitalize text-[var(--primary)]"
            >
              {tag.replace(/_/g, " ")}
            </Link>
          ))}
        </section>
      )}

      <Suspense fallback={<RelatedProductsSkeleton />}>
        <RelatedProducts products={relatedProducts} />
      </Suspense>

      <ProductReviews
        productId={product.id}
        slug={product.slug}
        summary={reviewSummary}
        reviews={reviews}
      />

      {!isPreview && (
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
      )}
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
      <div className={PRODUCT_MOSAIC}>
        {related.map((item) => (
          <ProductCard key={item.id} product={item} />
        ))}
      </div>
    </section>
  );
}

function RelatedProductsSkeleton() {
  return (
    <section className="mt-16" aria-hidden>
      <div className="mb-5 h-7 w-44 animate-pulse rounded bg-[var(--muted)]" />
      <div className={PRODUCT_MOSAIC}>
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className={`${PRODUCT_CARD_FRAME} animate-pulse rounded-3xl bg-[var(--muted)]`}
          />
        ))}
      </div>
    </section>
  );
}

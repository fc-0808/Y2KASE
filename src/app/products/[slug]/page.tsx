import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getProductBySlug, getRelatedProducts } from "@/lib/products";
import { getReviewSummary, getPublishedReviews } from "@/lib/reviews";
import { ProductDetailClient } from "@/components/ProductDetailClient";
import { ProductReviews } from "@/components/reviews/ProductReviews";
import { ProductCard } from "@/components/ProductCard";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { SocialShare } from "@/components/SocialShare";
import { JsonLd } from "@/components/JsonLd";
import { BRAND, breadcrumbJsonLd, productJsonLd } from "@/lib/seo";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://y2kase.com";

export const revalidate = 3600; // ISR: refresh product pages hourly.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };

  const description =
    product.description?.trim().slice(0, 160) || BRAND.description;
  const canonical = `/products/${product.slug}`;

  // og:image comes from the colocated opengraph-image.tsx (branded card);
  // Twitter falls back to it automatically.
  return {
    title: product.title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title: product.title,
      description,
      url: canonical,
    },
    twitter: {
      card: "summary_large_image",
      title: product.title,
      description,
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

  const [reviewSummary, reviews, related] = await Promise.all([
    getReviewSummary(product.id),
    getPublishedReviews(product.id),
    getRelatedProducts({ productId: product.id, productType: product.productType }),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <JsonLd
        data={[
          productJsonLd(product, reviewSummary),
          breadcrumbJsonLd([
            { name: "Home", url: "/" },
            { name: "Shop", url: "/products" },
            { name: product.title, url: `/products/${product.slug}` },
          ]),
        ]}
      />
      <Link
        href="/products"
        className="mb-6 inline-flex items-center gap-1 text-sm font-semibold text-[var(--foreground)]/60 hover:text-[var(--primary)]"
      >
        <ChevronLeft className="h-4 w-4" /> Back to shop
      </Link>

      <ProductDetailClient
        productId={product.id}
        slug={product.slug}
        title={product.title}
        price={Number(product.price)}
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

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-5 text-xl font-black">You may also like</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

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

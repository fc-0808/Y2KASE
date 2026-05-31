import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getProductBySlug } from "@/lib/products";
import { ProductDetailClient } from "@/components/ProductDetailClient";

export const revalidate = 3600; // ISR: refresh product pages hourly.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };
  return {
    title: product.title,
    description: product.description?.slice(0, 160) ?? undefined,
    openGraph: {
      title: product.title,
      images: product.images[0]?.url ? [product.images[0].url] : [],
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

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
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
        images={product.images.map((i) => ({
          id: i.id,
          url: i.url,
          altText: i.altText,
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
    </div>
  );
}

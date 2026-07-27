import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { ProductMedia } from "@/components/ProductMedia";
import { Stars } from "@/components/reviews/Stars";
import type { ProductListItem } from "@/lib/products";

export function ProductCard({ product }: { product: ProductListItem }) {
  const onSale =
    product.compareAtPrice &&
    Number(product.compareAtPrice) > Number(product.price);

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-[0_10px_30px_-22px_rgba(120,60,120,0.5)] transition duration-300 hover:-translate-y-1.5 hover:border-[var(--primary)] hover:shadow-[0_22px_45px_-22px_rgba(255,62,165,0.55)]"
    >
      {/*
        Catalog photos are normalized to 1024x1280 (4:5) on an OPAQUE white
        canvas, with the case letterboxed inside it — a ~1:2 product centred in
        a 4:5 frame leaves ~21% baked-in white down each side. Since that white
        is image pixels (no alpha), no amount of container styling removes it.
        The only lever is to crop it: on mobile we narrow the frame to 2:3 and
        zoom slightly, so `object-cover` trims the dead side margins down to
        ~13% and the case becomes the focal point. The 8% zoom is deliberately
        under the normalizer's 4% vertical padding, so the case is never clipped
        top or bottom. Desktop keeps the 4:5 frame that matches the source.
      */}
      <ProductMedia
        src={product.imageUrl}
        alt={product.title}
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        className="aspect-[2/3] md:aspect-[4/5]"
        imageClassName="scale-[1.08] transition duration-500 md:scale-100 md:group-hover:scale-105"
      >
        {onSale && (
          <span className="absolute left-3 top-3 rounded-full bg-[var(--primary)] px-2.5 py-1 text-xs font-extrabold text-white shadow-[0_3px_0_#d62f88]">
            Sale
          </span>
        )}
      </ProductMedia>
      {/* Centred on mobile to balance the centred product; left-aligned from md. */}
      <div className="flex flex-1 flex-col gap-1.5 p-3 text-center md:gap-2 md:p-4 md:text-left">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug transition group-hover:text-[var(--primary)]">
          {product.title}
        </h3>
        {product.rating && product.rating.count > 0 && (
          <div className="flex items-center justify-center gap-1 md:justify-start">
            <Stars rating={product.rating.average} size={13} />
            <span className="text-xs font-semibold text-[var(--foreground)]/50">
              ({product.rating.count})
            </span>
          </div>
        )}
        <div className="mt-auto flex flex-wrap items-baseline justify-center gap-x-2 md:justify-start">
          <span className="font-extrabold text-[var(--primary)]">
            <span className="text-xs font-semibold text-[var(--foreground)]/45">
              from{" "}
            </span>
            {formatPrice(product.price, product.currency)}
          </span>
          {onSale && (
            <span className="text-sm text-[var(--foreground)]/40 line-through">
              {formatPrice(product.compareAtPrice!, product.currency)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

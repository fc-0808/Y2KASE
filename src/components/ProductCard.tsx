import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
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
      <div className="relative aspect-square overflow-hidden bg-holo">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center text-4xl">🎀</div>
        )}
        {onSale && (
          <span className="absolute left-3 top-3 rounded-full bg-[var(--primary)] px-2.5 py-1 text-xs font-extrabold text-white shadow-[0_3px_0_#d62f88]">
            Sale
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug transition group-hover:text-[var(--primary)]">
          {product.title}
        </h3>
        {product.rating && product.rating.count > 0 && (
          <div className="flex items-center gap-1">
            <Stars rating={product.rating.average} size={13} />
            <span className="text-xs font-semibold text-[var(--foreground)]/50">
              ({product.rating.count})
            </span>
          </div>
        )}
        <div className="mt-auto flex items-center gap-2">
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

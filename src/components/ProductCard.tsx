import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { ProductMedia } from "@/components/ProductMedia";
import { Stars } from "@/components/reviews/Stars";
import { deviceOfProductType } from "@/lib/catalog/devices";
import type { ProductListItem } from "@/lib/products";

/**
 * Storefront product mosaic. Denser gutters on a phone so more of the case is
 * on the first fold; from `sm` the original 16px gap returns.
 */
export const PRODUCT_MOSAIC =
  "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5";

/**
 * Shared listing-tile frame. Every card keeps this ratio so a mixed iPhone /
 * AirPods row still lines up (CASETiFY, SSENSE, Farfetch). How the *photo*
 * fills the frame is per-type — see {@link catalogCardMedia}.
 */
export const PRODUCT_CARD_FRAME = "aspect-[2/3] md:aspect-[4/5]";

/**
 * Phone cases are tall and letterboxed inside the 4:5 master, so the mobile
 * 2:3 cover crop + 8% zoom is a feature: it trims baked-in side white without
 * eating the case. AirPods cases (and hanging charms) are squat and already
 * fill that canvas — the same crop clips the shell and the charm. Apple,
 * CASETiFY and Baymard all keep the full SKU visible in the listing tile;
 * we contain those photos instead of covering them.
 */
const SHOW_FULL_PRODUCT = new Set(["airpod_case", "apple_accessory"]);

function catalogCardMedia(productType?: string): {
  fit: "cover" | "contain";
  imageClassName: string;
} {
  if (productType && SHOW_FULL_PRODUCT.has(productType)) {
    return {
      fit: "contain",
      imageClassName: "",
    };
  }
  return {
    fit: "cover",
    imageClassName:
      "scale-[1.08] transition duration-500 md:scale-100 md:group-hover:scale-105",
  };
}

export function ProductCard({
  product,
  imagePriority = false,
  headingLevel = 3,
  showDeviceBadge = true,
}: {
  product: ProductListItem;
  /** Use only for the first visible card when it can become the route LCP. */
  imagePriority?: boolean;
  /** Match the surrounding page outline: catalog roots use h2, rails use h3. */
  headingLevel?: 2 | 3;
  /**
   * Non-iPhone lines get a kicker ("AirPods") so a mixed Hello Kitty grid is
   * scannable. Device landings and device-narrowed catalogs pass false — the
   * page already named the line.
   */
  showDeviceBadge?: boolean;
}) {
  const onSale =
    product.compareAtPrice &&
    Number(product.compareAtPrice) > Number(product.price);
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const device =
    showDeviceBadge && product.productType
      ? deviceOfProductType(product.productType)
      : undefined;
  const deviceKicker =
    device && device.id !== "iphone" ? device.label : undefined;
  const media = catalogCardMedia(product.productType);

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[0_8px_24px_-20px_rgba(120,60,120,0.45)] transition duration-300 hover:-translate-y-1.5 hover:border-[var(--primary)] hover:shadow-[0_22px_45px_-22px_rgba(255,62,165,0.55)] active:scale-[0.99] md:rounded-3xl md:shadow-[0_10px_30px_-22px_rgba(120,60,120,0.5)]"
    >
      <ProductMedia
        src={product.imageUrl}
        alt={product.title}
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 360px"
        loading={imagePriority ? "eager" : "lazy"}
        fetchPriority={imagePriority ? "high" : "auto"}
        fit={media.fit}
        className={PRODUCT_CARD_FRAME}
        imageClassName={media.imageClassName}
      >
        {onSale && (
          <span className="absolute left-2 top-2 rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] font-extrabold text-white shadow-[0_3px_0_#d62f88] md:left-3 md:top-3 md:px-2.5 md:py-1 md:text-xs">
            Sale
          </span>
        )}
      </ProductMedia>
      {/*
        Left-aligned at every breakpoint. Centred card copy looks balanced
        against a centred product photo but it is slower to scan across a
        two-column grid (Baymard: title and price must be visually distinct
        *and* comparable between neighbours). The kicker / title / price stack
        is now the same language as CASETiFY and the desktop cards.
      */}
      <div className="flex flex-1 flex-col gap-1 p-2.5 text-left md:gap-2 md:p-4">
        {deviceKicker && (
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--primary)]">
            {deviceKicker}
          </p>
        )}
        <Heading className="line-clamp-2 text-[13px] font-bold leading-snug transition group-hover:text-[var(--primary)] md:text-sm">
          {product.title}
        </Heading>
        {product.rating && product.rating.count > 0 && (
          <div className="flex items-center gap-1">
            <Stars rating={product.rating.average} size={12} />
            <span className="text-[11px] font-semibold text-[var(--foreground)]/50 md:text-xs">
              ({product.rating.count})
            </span>
          </div>
        )}
        <div className="mt-auto flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-[15px] font-extrabold leading-none text-[var(--primary)] md:text-base">
            <span className="text-[10px] font-semibold text-[var(--foreground)]/45 md:text-xs">
              from{" "}
            </span>
            {formatPrice(product.price, product.currency)}
          </span>
          {onSale && (
            <span className="text-xs text-[var(--foreground)]/40 line-through md:text-sm">
              {formatPrice(product.compareAtPrice!, product.currency)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

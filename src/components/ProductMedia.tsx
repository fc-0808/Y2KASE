import Image from "next/image";
import type { ReactNode } from "react";

type ProductMediaFit = "cover" | "contain";

/**
 * Canonical renderer for product imagery across the storefront.
 *
 * Every product photo — grid tiles, PDP, cart, orders — sits on the shared
 * `--product-surface` backdrop so the catalog reads as one consistent, brand.
 * Changing the product-photo surface is a one-line edit on that token.
 *
 * The component owns only the framed media (a `fill` image on the unified
 * surface, plus a graceful fallback). Sizing, radius and borders stay with the
 * caller via `className`, and overlays (sale badges, video controls) render as
 * `children`.
 */
export function ProductMedia({
  src,
  alt,
  sizes,
  fit = "cover",
  priority = false,
  className,
  imageClassName,
  fallbackClassName = "text-4xl",
  children,
}: {
  src?: string | null;
  alt: string;
  sizes?: string;
  fit?: ProductMediaFit;
  priority?: boolean;
  /** Container classes: sizing (aspect/height/width), radius, borders. */
  className?: string;
  /** Extra image classes, e.g. hover transforms. */
  imageClassName?: string;
  /** Sizing for the emoji fallback shown when no image is available. */
  fallbackClassName?: string;
  children?: ReactNode;
}) {
  const fitClass = fit === "contain" ? "object-contain" : "object-cover";

  return (
    <div
      className={`relative overflow-hidden bg-[var(--product-surface)]${
        className ? ` ${className}` : ""
      }`}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className={`${fitClass}${imageClassName ? ` ${imageClassName}` : ""}`}
        />
      ) : (
        <div className={`grid h-full place-items-center ${fallbackClassName}`}>
          🎀
        </div>
      )}
      {children}
    </div>
  );
}

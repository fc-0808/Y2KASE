"use client";

import Image from "next/image";
import type { ImageProps } from "next/image";
import { useState, type ReactNode } from "react";
import { canonicalizePublicR2Url } from "@/lib/catalog/r2-public";
import { isStorefrontRenderableUrl } from "@/lib/catalog/storefront-media";

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
 *
 * A URL that 404s (or that {@link isStorefrontRenderableUrl} already rejected)
 * never stays as a native broken-image icon — we swap to the fallback so a
 * single dead object cannot blank a listing card or the PDP hero.
 */
export function ProductMedia({
  src,
  alt,
  sizes,
  fit = "cover",
  loading,
  fetchPriority,
  className,
  imageClassName,
  bare = false,
  fallbackClassName = "text-4xl",
  onImageError,
  onLoad,
  children,
}: {
  src?: string | null;
  alt: string;
  sizes?: string;
  fit?: ProductMediaFit;
  loading?: ImageProps["loading"];
  fetchPriority?: ImageProps["fetchPriority"];
  /** Container classes: sizing (aspect/height/width), radius, borders. */
  className?: string;
  /** Extra image classes, e.g. hover transforms. */
  imageClassName?: string;
  /**
   * Listing tiles only. Drops the white photo well and knocks the studio
   * white out of the photo, so the page shows through on every browser.
   */
  bare?: boolean;
  /** Sizing for the emoji fallback shown when no image is available. */
  fallbackClassName?: string;
  /** Fired after a requested `src` fails to decode, so galleries can drop it. */
  onImageError?: (src: string) => void;
  /** Natural size, so a caller can choose cover vs contain. */
  onLoad?: (size: { width: number; height: number }) => void;
  children?: ReactNode;
}) {
  const renderable = isStorefrontRenderableUrl(src)
    ? canonicalizePublicR2Url(src)
    : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const fitClass = fit === "contain" ? "object-contain" : "object-cover";
  const showImage = Boolean(renderable) && failedSrc !== renderable;

  return (
    <div
      className={`relative ${
        bare ? "bg-transparent" : "overflow-hidden bg-[var(--product-surface)]"
      }${className ? ` ${className}` : ""}`}
    >
      {showImage && renderable ? (
        bare ? (
          // The knockout is a filter on these pixels, not a blend with the
          // page. A scrolling row isolates blend mode (Safari, Chrome,
          // Firefox), so the studio white has to be removed here. It runs
          // at every viewport — see `.studio-knockout`.
          <div className="absolute inset-0 overflow-hidden">
            <div className="studio-knockout absolute inset-0">
              <Image
                src={renderable}
                alt={alt}
                fill
                sizes={sizes}
                quality={82}
                unoptimized
                loading={loading}
                fetchPriority={fetchPriority}
                onError={() => {
                  setFailedSrc(renderable);
                  onImageError?.(renderable);
                }}
                onLoad={(event) => {
                  const img = event.currentTarget;
                  if (img.naturalWidth > 0) {
                    onLoad?.({
                      width: img.naturalWidth,
                      height: img.naturalHeight,
                    });
                  }
                }}
                className={`${fitClass}${imageClassName ? ` ${imageClassName}` : ""}`}
              />
            </div>
          </div>
        ) : (
          <Image
            src={renderable}
            alt={alt}
            fill
            sizes={sizes}
            quality={82}
            // Catalog photos are already WebP on R2. Never send them through
            // `/_next/image` — Vercel is 402ing that path, and the volume would
            // re-exhaust Image Optimization quota if it is later re-enabled.
            unoptimized
            loading={loading}
            fetchPriority={fetchPriority}
            onError={() => {
              setFailedSrc(renderable);
              onImageError?.(renderable);
            }}
            onLoad={(event) => {
              const img = event.currentTarget;
              if (img.naturalWidth > 0) {
                onLoad?.({
                  width: img.naturalWidth,
                  height: img.naturalHeight,
                });
              }
            }}
            className={`${fitClass}${imageClassName ? ` ${imageClassName}` : ""}`}
          />
        )
      ) : (
        <div className={`grid h-full place-items-center ${fallbackClassName}`}>
          🎀
        </div>
      )}
      {children}
    </div>
  );
}

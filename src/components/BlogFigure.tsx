import Image from "next/image";
import Link from "next/link";
import type { PostFigure } from "@/lib/blog/types";

/**
 * An in-article product still.
 *
 * These are real catalog photographs (see src/lib/blog/media.ts), so they are
 * presented the way the storefront presents product imagery: contained, never
 * cropped, on the shared neutral `--product-surface`. Cropping to a wide
 * editorial banner would cut the charms and straps off the bottom of a portrait
 * listing photo — the exact detail the surrounding paragraph is describing.
 *
 * The frame is capped well below the article's text column so a figure reads as
 * a punctuation mark between sections rather than a full-bleed banner.
 *
 * Loading is left lazy by default: figures always sit below the hero, which is
 * the post's LCP element and the only image that should preload.
 */
export function BlogFigure({ figure }: { figure: PostFigure }) {
  const frame = (
    <div className="relative aspect-square overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--product-surface)]">
      <Image
        src={figure.url}
        alt={figure.alt}
        fill
        sizes="(max-width: 640px) 100vw, 420px"
        className="object-contain transition-transform duration-500 group-hover:scale-[1.04]"
      />
    </div>
  );

  return (
    <figure className="mx-auto my-8 w-full max-w-[420px] sm:my-10">
      {figure.href ? (
        <Link href={figure.href} className="group block">
          {frame}
        </Link>
      ) : (
        frame
      )}

      {figure.caption && (
        <figcaption className="mt-3 text-center text-xs font-semibold text-[var(--foreground)]/55">
          {figure.href ? (
            <Link
              href={figure.href}
              className="transition hover:text-[var(--primary)]"
            >
              {figure.caption} <span aria-hidden="true">→</span>
            </Link>
          ) : (
            figure.caption
          )}
        </figcaption>
      )}
    </figure>
  );
}

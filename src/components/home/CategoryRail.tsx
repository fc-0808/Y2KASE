"use client";

/**
 * CategoryRail — horizontal, scrollable row of category tiles
 * (CASETiFY-style co-lab strip), one per character / brand / style.
 *
 * - Native scroll-snap for momentum on touch.
 * - Tile width is the shelf width used by the product photos, so a collection
 *   and a case line up. Edge arrows stay up whenever that side can still
 *   scroll, so the cropped card reads as a carousel.
 * - Each tile shows a bespoke, on-brand cover image (generated with Nano Banana
 *   Pro, one per collection — see `scripts/generate-collection-covers.ts`) in a
 *   16:9 frame that matches the art's aspect, so nothing is cropped. Collections
 *   without a generated cover fall back to a clean accent-gradient tile.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  COLLECTION_COVER_SLUGS,
  collectionCoverSrc,
} from "@/lib/brand/collection-covers";

export type RailCategory = {
  slug: string;
  name: string;
  icon: string | null;
  accent: string | null;
  count: number;
  kind: string;
};

/** Same width as a homepage product photo. See `.category-rail__tile`. */
const TILE = "group category-rail__tile shrink-0 snap-start";

export function CategoryRail({ categories }: { categories: RailCategory[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  // Assume there is more to the right until the row is measured, so the
  // scroll cue is on screen for the first paint.
  const [edges, setEdges] = useState({ left: false, right: true });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({
      left: el.scrollLeft > 8,
      right: max > 8 && el.scrollLeft < max - 8,
    });
  }, []);

  useEffect(() => {
    measure();
    const el = scroller.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure, categories.length]);

  function page(dir: 1 | -1) {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: "smooth" });
  }

  if (categories.length === 0) return null;

  return (
    <div className="category-rail relative">
      {edges.left ? (
        <button
          type="button"
          onClick={() => page(-1)}
          aria-label="Scroll collections left"
          className={arrowClass("left")}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : null}
      {edges.right ? (
        <button
          type="button"
          onClick={() => page(1)}
          aria-label="Scroll collections right"
          className={arrowClass("right")}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      ) : null}

      <div
        ref={scroller}
        onScroll={measure}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {categories.map((c) => {
          const accent = c.accent ?? "#ff3ea5";
          const hasCover = COLLECTION_COVER_SLUGS.has(c.slug);
          return (
            <Link
              key={c.slug}
              href={`/collections/${c.slug}`}
              prefetch={false}
              aria-label={c.name}
              className={TILE}
            >
              {/* The collection name is baked into the cover art, so a second
                  caption under the tile only repeats it. */}
              <CategoryArtwork
                name={c.name}
                src={hasCover ? collectionCoverSrc(c.slug) : null}
                accent={accent}
              />
            </Link>
          );
        })}

        {/* Trailing "view all" tile */}
        <Link
          href="/collections"
          prefetch={false}
          className={TILE}
        >
          <div className="grid aspect-video place-items-center rounded-3xl border-2 border-dashed border-[var(--primary)]/40 bg-[var(--card)] p-5 text-center transition duration-300 group-hover:-translate-y-1.5 group-hover:border-[var(--primary)]">
            <span className="font-display text-lg font-extrabold text-[var(--primary)] sm:text-xl">
              View all →
            </span>
          </div>
        </Link>
      </div>
    </div>
  );
}

function arrowClass(side: "left" | "right") {
  return [
    "absolute top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-white bg-white/95 text-[var(--foreground)] shadow-md md:h-10 md:w-10 md:border-[var(--border)] md:bg-[var(--card)] md:transition md:hover:text-[var(--primary)]",
    side === "left" ? "left-1 md:-left-3" : "right-1 md:-right-3",
  ].join(" ");
}

function CategoryArtwork({
  name,
  src,
  accent,
}: {
  name: string;
  src: string | null;
  accent: string;
}) {
  return (
    <div
      className="relative aspect-video overflow-hidden rounded-3xl border border-[var(--border)] shadow-[0_10px_30px_-22px_rgba(120,60,120,0.6)] transition duration-300 group-hover:-translate-y-1.5 group-hover:border-[var(--primary)] group-hover:shadow-[0_22px_45px_-22px_rgba(255,62,165,0.5)]"
      style={{
        background: `linear-gradient(155deg, ${accent}40 0%, ${accent}17 50%, #ffffff 100%)`,
      }}
    >
      {src ? (
        <Image
          src={src}
          alt=""
          fill
          quality={72}
          sizes="(max-width: 720px) 160px, 384px"
          className="object-cover transition duration-500 group-hover:scale-105"
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center p-4 text-center">
          <span aria-hidden className="bg-grid absolute inset-0 opacity-20" />
          <span className="relative font-display text-lg font-extrabold text-[var(--foreground)] sm:text-xl">
            {name}
          </span>
        </span>
      )}
    </div>
  );
}

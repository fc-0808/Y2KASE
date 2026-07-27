"use client";

/**
 * CategoryRail — horizontal, scrollable row of portrait category tiles
 * (CASETiFY-style co-lab strip), one per character / brand / style.
 *
 * - Native scroll-snap for buttery momentum on touch.
 * - Desktop arrow controls that page the rail by ~one viewport.
 * - Each tile shows a bespoke, on-brand cover image (generated with Nano Banana
 *   Pro, one per collection — see `scripts/generate-collection-covers.ts`) in a
 *   4:3 frame that matches the art's aspect, so nothing is cropped. Collections
 *   without a generated cover fall back to a clean accent-gradient tile.
 */

import { useRef } from "react";
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

export function CategoryRail({ categories }: { categories: RailCategory[] }) {
  const scroller = useRef<HTMLDivElement>(null);

  function page(dir: 1 | -1) {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: "smooth" });
  }

  if (categories.length === 0) return null;

  return (
    <div className="relative">
      {/* Arrows */}
      <button
        type="button"
        onClick={() => page(-1)}
        aria-label="Scroll left"
        className="absolute -left-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-[var(--border)] bg-[var(--card)] shadow-md transition hover:text-[var(--primary)] md:grid"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => page(1)}
        aria-label="Scroll right"
        className="absolute -right-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-[var(--border)] bg-[var(--card)] shadow-md transition hover:text-[var(--primary)] md:grid"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div
        ref={scroller}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {categories.map((c) => {
          const accent = c.accent ?? "#ff3ea5";
          const hasCover = COLLECTION_COVER_SLUGS.has(c.slug);
          return (
            <Link
              key={c.slug}
              href={`/collections/${c.slug}`}
              className="group w-64 shrink-0 snap-start sm:w-80"
            >
              {/* Banner cover — the collection name is baked into the art
                  (CaseBang style). Falls back to a name-on-gradient tile. */}
              <div className="relative aspect-video overflow-hidden rounded-3xl border border-[var(--border)] shadow-[0_10px_30px_-22px_rgba(120,60,120,0.6)] transition duration-300 group-hover:-translate-y-1.5 group-hover:border-[var(--primary)] group-hover:shadow-[0_22px_45px_-22px_rgba(255,62,165,0.5)]">
                {hasCover ? (
                  <Image
                    src={collectionCoverSrc(c.slug)}
                    alt={c.name}
                    fill
                    sizes="(max-width: 640px) 256px, 320px"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />
                ) : (
                  <span
                    className="absolute inset-0 grid place-items-center p-4 text-center"
                    style={{
                      background: `linear-gradient(155deg, ${accent}40 0%, ${accent}17 50%, #ffffff 100%)`,
                    }}
                  >
                    <span
                      aria-hidden
                      className="bg-grid absolute inset-0 opacity-20"
                    />
                    <span className="relative font-display text-lg font-extrabold text-[var(--foreground)] sm:text-xl">
                      {c.name}
                    </span>
                  </span>
                )}
              </div>
            </Link>
          );
        })}

        {/* Trailing "view all" tile */}
        <Link
          href="/collections"
          className="group w-64 shrink-0 snap-start sm:w-80"
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

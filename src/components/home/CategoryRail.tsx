"use client";

/**
 * CategoryRail — horizontal, scrollable row of square category tiles
 * (CASETiFY-style co-lab strip), one per character / brand / style.
 *
 * - Native scroll-snap for buttery momentum on touch.
 * - Desktop arrow controls that page the rail by ~one viewport.
 * - Tiles are brand-skinned gradient squares built from each collection's
 *   accent colour + emoji (we have no per-collection art yet).
 */

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CategoryIcon } from "@/components/brand/CategoryIcon";

export type RailCategory = {
  slug: string;
  name: string;
  icon: string | null;
  accent: string | null;
  count: number;
  kind: string;
  /** Representative product photo (preferred over the icon when present). */
  thumb?: string | null;
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
          return (
            <Link
              key={c.slug}
              href={`/collections/${c.slug}`}
              className="group flex w-32 shrink-0 snap-start flex-col gap-2 sm:w-40"
            >
              {/* Square art tile — real product photo when available, else icon */}
              <div
                className="relative aspect-square overflow-hidden rounded-3xl border border-white shadow-[0_10px_30px_-22px_rgba(120,60,120,0.6)] transition duration-300 group-hover:-translate-y-1.5 group-hover:shadow-[0_22px_45px_-22px_rgba(255,62,165,0.5)]"
                style={{
                  background: `linear-gradient(150deg, ${accent}38 0%, ${accent}14 55%, #ffffff 100%)`,
                }}
              >
                {c.thumb ? (
                  <Image
                    src={c.thumb}
                    alt={c.name}
                    fill
                    sizes="(max-width: 640px) 128px, 160px"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />
                ) : (
                  <span className="absolute inset-0 grid place-items-center">
                    <CategoryIcon
                      slug={c.slug}
                      color={accent}
                      kind={c.kind}
                      className="h-14 w-14 sm:h-16 sm:w-16"
                    />
                  </span>
                )}
              </div>
              <div className="px-1 text-center">
                <p className="font-display text-sm font-extrabold leading-tight text-[var(--foreground)] group-hover:text-[var(--primary)]">
                  {c.name}
                </p>
                {c.count > 0 && (
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/45">
                    {c.count} item{c.count === 1 ? "" : "s"}
                  </p>
                )}
              </div>
            </Link>
          );
        })}

        {/* Trailing "view all" tile */}
        <Link
          href="/collections"
          className="group flex w-32 shrink-0 snap-start flex-col gap-2 sm:w-40"
        >
          <div className="grid aspect-square place-items-center rounded-3xl border-2 border-dashed border-[var(--primary)]/40 bg-[var(--card)] transition duration-300 group-hover:-translate-y-1.5 group-hover:border-[var(--primary)]">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-holo text-3xl transition group-hover:scale-110 sm:h-16 sm:w-16">
              ✨
            </span>
          </div>
          <p className="px-1 text-center font-display text-sm font-extrabold text-[var(--primary)]">
            View all
          </p>
        </Link>
      </div>
    </div>
  );
}

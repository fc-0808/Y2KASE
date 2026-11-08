"use client";

/**
 * LookRail — the design browser on every catalog grid.
 *
 * Characters, themes and colors are the reason someone is on this page. They
 * used to live only inside the filter sheet. One horizontal strip writes the
 * same URL the sheet writes: one tap, one look, and a second tap clears it.
 * Combining several of the same facet stays in the sheet.
 *
 * The character list is computed on the server ({@link lookCharacters}) so
 * this island does not import the taxonomy seed. Rail crops are lazy and low
 * priority — the first product photo remains the thing the browser fetches
 * first. Resting on a tile prefetches that grid; a sweep does not, because
 * each prefetch is a live catalog read.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowDownAZ, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { COLOR_FAMILIES } from "@/lib/catalog/colors";
import { MOTIF_FAMILIES } from "@/lib/catalog/motifs";
import { COLLECTION_COVER_SLUGS } from "@/lib/brand/collection-covers";
import { collectionRailSrc } from "@/lib/brand/collection-rail";
import {
  activeLookSegment,
  lookSegments,
  nextLookSelection,
  orderByLabel,
  railScrollLeft,
  stockedFamilies,
  type LookCharacter,
  type LookSegmentId,
} from "@/lib/catalog/look-rail";
import { buildCatalogHref } from "@/lib/catalog/params";
import { cn } from "@/lib/utils";
import { ColorSwatch } from "./ColorSwatch";
import { MotifMark } from "./MotifMark";
import type { CatalogFilterModel } from "./use-catalog-filters";

const SEGMENT_LABEL: Record<LookSegmentId, string> = {
  characters: "Characters",
  themes: "Themes",
  colors: "Colors",
};

export function LookRail({
  model,
  characters,
  characterPage,
}: {
  model: CatalogFilterModel;
  characters: readonly LookCharacter[];
  /** Character landing: this slug stays chosen, and taps open collection pages. */
  characterPage?: { current: string; clearHref: string };
}) {
  const router = useRouter();
  const { params, counts, selectedBrands, selectedColors, selectedMotifs, navigate } =
    model;
  const [picked, setPicked] = useState<LookSegmentId | null>(null);
  const [alphabetical, setAlphabetical] = useState(false);
  const themes = orderByLabel(
    stockedFamilies(MOTIF_FAMILIES, counts.motifs, selectedMotifs),
    (family) => family.label,
    alphabetical,
  );
  const colors = orderByLabel(
    stockedFamilies(COLOR_FAMILIES, counts.colors, selectedColors),
    (family) => family.label,
    alphabetical,
  );
  const orderedCharacters = orderByLabel(
    characters,
    (tile) => tile.name,
    alphabetical,
  );
  const segments = lookSegments({
    characters: characters.length,
    themes: themes.length,
    colors: colors.length,
  });
  const segment = activeLookSegment(segments, picked, {
    brands: selectedBrands.length + (characterPage ? 1 : 0),
    motifs: selectedMotifs.length,
    colors: selectedColors.length,
  });

  const baseId = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: true });

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft > 8;
    const right = max > 8 && el.scrollLeft < max - 8;
    setEdges((prev) =>
      prev.left === left && prev.right === right ? prev : { left, right },
    );
  }, []);

  useEffect(() => {
    measure();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure, segment, characters.length, themes.length, colors.length]);

  const selectionKey = `${segment}:${selectedBrands.join(",")}|${selectedMotifs.join(",")}|${selectedColors.join(",")}`;
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const pressed = root.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!pressed) {
      root.scrollTo({ left: 0 });
      return;
    }
    const next = railScrollLeft({
      scrollLeft: root.scrollLeft,
      clientWidth: root.clientWidth,
      itemLeft: pressed.offsetLeft,
      itemWidth: pressed.offsetWidth,
    });
    if (next == null) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.scrollTo({ left: next, behavior: reduce ? "auto" : "smooth" });
  }, [selectionKey, alphabetical, segment]);

  const prefetchTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(prefetchTimer.current), []);
  const prefetch = useCallback(
    (
      overrides: { brands?: string[]; colors?: string[]; motifs?: string[] },
      immediate = false,
    ) => {
      window.clearTimeout(prefetchTimer.current);
      const href = buildCatalogHref(params, overrides);
      if (immediate) {
        router.prefetch(href);
        return;
      }
      prefetchTimer.current = window.setTimeout(() => {
        router.prefetch(href);
      }, 200);
    },
    [params, router],
  );

  if (!segment) return null;

  function characterHref(slug: string): string {
    if (!characterPage) return buildCatalogHref(params, { brands: [slug] });
    if (slug === characterPage.current) return characterPage.clearHref;
    return buildCatalogHref({
      ...params,
      basePath: `/collections/${slug}`,
      brands: [],
      page: 1,
    });
  }

  function openCharacter(slug: string) {
    if (!characterPage) {
      navigate({ brands: nextLookSelection(selectedBrands, slug) });
      return;
    }
    router.push(characterHref(slug));
  }

  function page(dir: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({
      left: dir * Math.round(el.clientWidth * 0.8),
      behavior: reduce ? "auto" : "smooth",
    });
  }

  function onTabKey(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = segments.indexOf(segment!);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % segments.length;
    else if (event.key === "ArrowLeft")
      next = (index - 1 + segments.length) % segments.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = segments.length - 1;
    else return;
    event.preventDefault();
    const id = segments[next]!;
    setPicked(id);
    document.getElementById(`${baseId}-${id}`)?.focus();
  }

  return (
    <div className="mt-1.5 lg:mt-2">
      {segments.length > 1 && (
        <div
          role="tablist"
          aria-label="Browse by design"
          onKeyDown={onTabKey}
          className="flex w-fit max-w-full gap-2.5 lg:gap-3"
        >
          {segments.map((id) => {
            const selected = id === segment;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`${baseId}-${id}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => {
                  if (selected) setAlphabetical((on) => !on);
                  else setPicked(id);
                }}
                aria-label={
                  selected
                    ? alphabetical
                      ? `${SEGMENT_LABEL[id]}, sorted A to Z. Show the shop order.`
                      : `${SEGMENT_LABEL[id]}. Sort A to Z.`
                    : undefined
                }
                className={cn(
                  "relative h-8 text-[13px] font-extrabold transition motion-reduce:transition-none",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
                  selected
                    ? "text-[var(--foreground)]"
                    : "text-[var(--foreground)]/45 hover:text-[var(--foreground)]",
                )}
              >
                <span className="inline-flex items-center gap-1">
                  {SEGMENT_LABEL[id]}
                  {selected && (
                    <span
                      aria-hidden
                      className={cn(
                        "grid h-5 w-5 place-items-center rounded-full",
                        alphabetical
                          ? "bg-[var(--primary)] text-white"
                          : "bg-[var(--primary-soft)] text-[var(--primary)]",
                      )}
                    >
                      <ArrowDownAZ className="h-3 w-3" />
                    </span>
                  )}
                </span>
                {selected && (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 bottom-0.5 h-0.5 rounded-full bg-[var(--primary)]"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="relative mt-1 lg:mt-1.5">
        {edges.left && (
          <RailArrow
            side="left"
            square={segment === "themes"}
            onClick={() => page(-1)}
          />
        )}
        {edges.right && (
          <RailArrow
            side="right"
            square={segment === "themes"}
            onClick={() => page(1)}
          />
        )}
        <div
          ref={scrollerRef}
          id={`${baseId}-panel`}
          role="tabpanel"
          aria-labelledby={
            segments.length > 1 ? `${baseId}-${segment}` : undefined
          }
          aria-label={segments.length > 1 ? undefined : SEGMENT_LABEL[segment]}
          aria-busy={model.isPending}
          onMouseLeave={() => window.clearTimeout(prefetchTimer.current)}
          className={cn(
            "relative -mx-4 flex snap-x snap-proximity gap-2 overflow-x-auto scroll-px-4 px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:scroll-px-0 lg:gap-3 lg:px-0 [&::-webkit-scrollbar]:hidden",
            edges.left &&
              edges.right &&
              "[mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-32px),transparent)]",
            edges.left &&
              !edges.right &&
              "[mask-image:linear-gradient(to_right,transparent,black_12px)]",
            !edges.left &&
              edges.right &&
              "[mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)]",
          )}
        >
          {segment === "characters" &&
            orderedCharacters.map((tile) => {
              const pressed =
                selectedBrands.includes(tile.slug) ||
                tile.slug === characterPage?.current;
              return (
                <LookTile
                  key={tile.slug}
                  label={tile.name}
                  count={tile.count}
                  pressed={pressed}
                  onIntent={() => {
                    if (characterPage) {
                      router.prefetch(characterHref(tile.slug));
                      return;
                    }
                    prefetch({
                      brands: nextLookSelection(selectedBrands, tile.slug),
                    });
                  }}
                  onPress={() => {
                    if (characterPage) {
                      router.prefetch(characterHref(tile.slug));
                      return;
                    }
                    prefetch(
                      {
                        brands: nextLookSelection(selectedBrands, tile.slug),
                      },
                      true,
                    );
                  }}
                  onSelect={() => openCharacter(tile.slug)}
                >
                  <CharacterFace tile={tile} pressed={pressed} />
                </LookTile>
              );
            })}

          {segment === "themes" &&
            themes.map((family) => {
              const pressed = selectedMotifs.includes(family.slug);
              const count = counts.motifs[family.slug] ?? 0;
              return (
                <LookTile
                  key={family.slug}
                  label={family.label}
                  count={count}
                  pressed={pressed}
                  onIntent={() =>
                    prefetch({
                      motifs: nextLookSelection(selectedMotifs, family.slug),
                    })
                  }
                  onPress={() =>
                    prefetch(
                      {
                        motifs: nextLookSelection(selectedMotifs, family.slug),
                      },
                      true,
                    )
                  }
                  onSelect={() =>
                    navigate({
                      motifs: nextLookSelection(selectedMotifs, family.slug),
                    })
                  }
                >
                    <MotifMark
                      family={family}
                      size="lg"
                      className={cn(
                        "border",
                        pressed
                          ? "border-[var(--primary)] ring-2 ring-[var(--primary)]"
                          : "border-black/10",
                      )}
                    />
                </LookTile>
              );
            })}

          {segment === "colors" &&
            colors.map((family) => {
              const pressed = selectedColors.includes(family.slug);
              const count = counts.colors[family.slug] ?? 0;
              return (
                <LookTile
                  key={family.slug}
                  label={family.label}
                  count={count}
                  pressed={pressed}
                  onIntent={() =>
                    prefetch({
                      colors: nextLookSelection(selectedColors, family.slug),
                    })
                  }
                  onPress={() =>
                    prefetch(
                      {
                        colors: nextLookSelection(selectedColors, family.slug),
                      },
                      true,
                    )
                  }
                  onSelect={() =>
                    navigate({
                      colors: nextLookSelection(selectedColors, family.slug),
                    })
                  }
                >
                  <ColorSwatch
                    family={family}
                    size="lg"
                    className={cn(
                      "block aspect-video h-auto w-full rounded-xl border border-black/10",
                      pressed && "border-[var(--primary)] ring-2 ring-[var(--primary)]",
                    )}
                  />
                </LookTile>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function LookTile({
  label,
  count,
  pressed,
  onSelect,
  onIntent,
  onPress,
  children,
}: {
  label: string;
  count: number;
  pressed: boolean;
  onSelect: () => void;
  onIntent: () => void;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={
        count > 0
          ? `${label}, ${count.toLocaleString("en-US")} ${count === 1 ? "product" : "products"}`
          : label
      }
      onClick={onSelect}
      onMouseEnter={onIntent}
      onFocus={onIntent}
      onPointerDown={onPress}
      className={cn(
        "flex w-16 shrink-0 snap-start flex-col items-center gap-1 rounded-2xl lg:w-[6.75rem] lg:gap-1.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
        "motion-reduce:transition-none",
      )}
    >
      {children}
      <span
        className={cn(
          "w-full truncate text-center text-[11px] font-bold leading-tight lg:text-xs",
          pressed ? "text-[var(--primary)]" : "text-[var(--foreground)]/80",
        )}
      >
        {label}
      </span>
    </button>
  );
}

function CharacterFace({
  tile,
  pressed,
}: {
  tile: LookCharacter;
  pressed: boolean;
}) {
  const hasCover = COLLECTION_COVER_SLUGS.has(tile.slug);
  const accent = tile.accentColor ?? "#ff3ea5";
  return (
    <span
      className={cn(
        "relative block aspect-video w-full overflow-hidden rounded-xl border bg-[var(--card)]",
        pressed
          ? "border-[var(--primary)] ring-2 ring-[var(--primary)]"
          : "border-black/10",
      )}
      style={
        hasCover
          ? undefined
          : {
              background: `linear-gradient(155deg, ${accent}55 0%, #ffffff 78%)`,
            }
      }
    >
      {hasCover ? (
        <Image
          src={collectionRailSrc(tile.slug)}
          alt=""
          fill
          sizes="(min-width: 1024px) 108px, 80px"
          quality={75}
          fetchPriority="low"
          className="object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="grid h-full place-items-center text-lg leading-none"
        >
          {tile.icon ?? tile.name.slice(0, 1)}
        </span>
      )}
      {pressed && (
        <span
          aria-hidden
          className="absolute right-1 top-1 z-10 grid h-4 w-4 place-items-center rounded-full bg-[var(--primary)] text-white shadow-sm"
        >
          <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
        </span>
      )}
    </span>
  );
}

function RailArrow({
  side,
  square = false,
  onClick,
}: {
  side: "left" | "right";
  /** Theme stickers are square, so the arrow sits on their middle. */
  square?: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Scroll designs left" : "Scroll designs right"}
      className={cn(
        "absolute z-10 grid h-8 w-8 place-items-center rounded-full border border-[var(--border)] bg-white text-[var(--primary)] shadow-md",
        square ? "top-6 lg:top-9" : "top-1.5 lg:top-3.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        side === "left" ? "-left-1 lg:left-0" : "-right-1 lg:right-0",
      )}
    >
      <Icon aria-hidden className="h-4 w-4" />
    </button>
  );
}

"use client";

/**
 * CatalogToolbar — facets · search · sort, the one control bar every browse
 * surface wears.
 *
 * Everything it emits is addressed to `params.basePath`, which is what lets the
 * identical bar sit on `/products` and on a collection landing page without
 * either one routing the shopper off its own surface.
 *
 * ── Two chromes, one state ──────────────────────────────────────────────────
 * Both widths ask for a design with the look rail. Desktop keeps a Device
 * pill when the catalog sells more than one kind of product. The phone uses
 * the same question as a short sheet, and otherwise the bar is search plus
 * sort — characters, themes, colors and MagSafe are not a second menu.
 * The whole stack sticks under the header in the page color. Scrolling down
 * tucks it away; scrolling up brings the search row and the look rail back.
 *
 * One client island owns both chromes so optimistic checkbox state cannot
 * fork when the shopper resizes a tablet.
 */

import { useCallback, useRef, useState } from "react";
import { Search } from "lucide-react";
import { buildCatalogHref, type CatalogParams } from "@/lib/catalog/params";
import { cn } from "@/lib/utils";
import {
  CatalogFilters,
  type BrandOption,
  type FacetCounts,
} from "./CatalogFilters";
import { CatalogFilterSheet } from "./CatalogFilterSheet";
import { LookRail } from "./LookRail";
import { CatalogSortSheet, SortMenu, SortTriggerButton } from "./SortMenu";
import { useCatalogFilters } from "./use-catalog-filters";
import { useCollapseOnScrollDown } from "./use-collapse-on-scroll";
import type { LookCharacter } from "@/lib/catalog/look-rail";

export function CatalogToolbar({
  params,
  brands,
  counts,
  brandsLabel,
  searchPlaceholder = "Search cases…",
  searchLabel = "Search products",
  lockedDevice,
  resultCount,
  characters,
  flushTop = false,
}: {
  params: CatalogParams;
  brands: BrandOption[];
  counts: FacetCounts;
  brandsLabel?: string;
  searchPlaceholder?: string;
  searchLabel?: string;
  /** Device this surface is already scoped to — hides the Device facet. */
  lockedDevice?: string;
  /** Live result size, shown on the device sheet's apply button. */
  resultCount: number;
  /**
   * Shop All has no title, so the page's top padding would show the ambient
   * wash between the header and this bar. Pull the bar's own background up
   * through that padding.
   */
  flushTop?: boolean;
  /**
   * Character tiles for the look rail, already capped and ordered on the
   * server. Empty hides that segment; themes and colors still render.
   */
  characters: readonly LookCharacter[];
}) {
  const model = useCatalogFilters({
    params,
    brands,
    counts,
    brandsLabel,
    lockedDevice,
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const closeFilters = useCallback(() => setFilterOpen(false), []);
  const closeSort = useCallback(() => setSortOpen(false), []);
  // Typing or an open sheet pins the chrome. A downward scroll tucks the
  // search row and the character rail under the header; scrolling up brings
  // both back, even mid-page.
  const barRef = useRef<HTMLDivElement>(null);
  const collapsed = useCollapseOnScrollDown(
    !filterOpen && !sortOpen && !searchFocused,
    barRef,
  );

  return (
    <>
      <div
        ref={barRef}
        inert={collapsed}
        onFocusCapture={() => setSearchFocused(true)}
        onBlurCapture={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && event.currentTarget.contains(next)) return;
          setSearchFocused(false);
        }}
        className={cn(
          "sticky top-[var(--storefront-header-h)] z-30 -mx-4 bg-background px-4 pb-2 transition-transform duration-200 ease-out motion-reduce:transition-none sm:-mx-6 sm:px-6",
          flushTop && "-mt-4 pt-2 sm:-mt-6 sm:pt-2",
          collapsed && "-translate-y-full pointer-events-none",
        )}
      >
        <div className="flex items-center gap-3 lg:hidden">
          {model.deviceFacetVisible && (
            <button
              type="button"
              onClick={() => {
                setSortOpen(false);
                setFilterOpen(true);
              }}
              aria-expanded={filterOpen}
              aria-haspopup="dialog"
              className={cn(
                "flex h-11 shrink-0 items-center rounded-full border px-3.5 text-sm font-bold shadow-sm transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
                params.device || filterOpen
                  ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                  : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]/80",
              )}
            >
              {model.deviceTriggerLabel}
            </button>
          )}
          <CatalogSearch
            params={params}
            searchPlaceholder={searchPlaceholder}
            searchLabel={searchLabel}
            className="min-w-0"
          />
          <SortTriggerButton
            params={params}
            expanded={sortOpen}
            iconOnly
            className="w-11 flex-none px-0"
            onClick={() => {
              setFilterOpen(false);
              setSortOpen(true);
            }}
          />
        </div>

        <div className="relative z-20 hidden items-center gap-3 lg:flex">
          <CatalogFilters model={model} />
          <CatalogSearch
            params={params}
            searchPlaceholder={searchPlaceholder}
            searchLabel={searchLabel}
            className="w-full max-w-md"
          />
          <SortMenu params={params} />
        </div>

        <LookRail model={model} characters={characters} />
      </div>

      <CatalogFilterSheet
        open={filterOpen}
        onClose={closeFilters}
        model={model}
        resultCount={resultCount}
      />
      <CatalogSortSheet
        open={sortOpen}
        onClose={closeSort}
        params={params}
      />
    </>
  );
}

/**
 * Hidden inputs that carry the non-search facets through the search form.
 *
 * Generated from {@link buildCatalogHref} rather than written out by hand: the
 * form and a link to the same filtered view are then provably the same URL, and
 * adding a facet later can't leave this list quietly behind.
 */
function CatalogSearch({
  params,
  searchPlaceholder,
  searchLabel,
  className,
}: {
  params: CatalogParams;
  searchPlaceholder: string;
  searchLabel: string;
  className?: string;
}) {
  return (
    <form
      action={params.basePath}
      className={cn("relative flex-1", className)}
    >
      <PreservedFacets params={params} />
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--foreground)]/40"
      />
      <input
        type="search"
        name="q"
        defaultValue={params.q ?? ""}
        placeholder={searchPlaceholder}
        aria-label={searchLabel}
        key={params.q ?? ""}
        className="h-11 w-full rounded-full border border-[var(--border)] bg-[var(--card)] pl-10 pr-4 text-sm shadow-sm outline-none transition focus:border-[var(--primary)] lg:h-10"
      />
    </form>
  );
}

function PreservedFacets({ params }: { params: CatalogParams }) {
  const href = buildCatalogHref(params, { q: undefined, page: 1 });
  const query = href.split("?")[1] ?? "";
  return (
    <>
      {[...new URLSearchParams(query).entries()].map(([name, value]) => (
        <input key={`${name}=${value}`} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

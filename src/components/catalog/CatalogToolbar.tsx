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
 * Desktop (`lg+`) keeps the pill dropdowns: plenty of width, hover, and the
 * shopper can see the grid while they tick. Mobile does not — five wrapping
 * pills plus search plus sort ate most of the first fold (the attached
 * /products screenshot). Industry PLPs (Shopify Dawn, Nike, Apple, Sephora)
 * collapse that into a sticky Filter + Sort pair and a bottom sheet.
 *
 * One client island owns both chromes so optimistic checkbox state cannot
 * fork when the shopper resizes a tablet.
 */

import { useCallback, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import {
  activeFilterCount,
  buildCatalogHref,
  type CatalogParams,
} from "@/lib/catalog/params";
import { cn } from "@/lib/utils";
import {
  CatalogFilters,
  type BrandOption,
  type FacetCounts,
} from "./CatalogFilters";
import { CatalogFilterSheet } from "./CatalogFilterSheet";
import { CatalogSortSheet, SortMenu, SortTriggerButton } from "./SortMenu";
import { useCatalogFilters } from "./use-catalog-filters";

export function CatalogToolbar({
  params,
  brands,
  counts,
  brandsLabel,
  searchPlaceholder = "Search cases…",
  searchLabel = "Search products",
  lockedDevice,
  resultCount,
  resetHref,
}: {
  params: CatalogParams;
  brands: BrandOption[];
  counts: FacetCounts;
  brandsLabel?: string;
  searchPlaceholder?: string;
  searchLabel?: string;
  /** Device this surface is already scoped to — hides the Device facet. */
  lockedDevice?: string;
  /** Live result size, shown on the mobile sheet's apply button. */
  resultCount: number;
  /** Unfiltered href for this surface — omit when nothing is active. */
  resetHref?: string;
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
  const closeFilters = useCallback(() => setFilterOpen(false), []);
  const closeSort = useCallback(() => setSortOpen(false), []);
  const filterCount = activeFilterCount(params);

  return (
    <>
      <div className="sticky top-[var(--storefront-header-h)] z-30 -mx-4 border-b border-[var(--border)] bg-[var(--background)]/90 px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6 lg:static lg:z-auto lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
        {/* Mobile refine bar — search, then equal-weight Filter / Sort. */}
        <div className="flex flex-col gap-2 lg:hidden">
          <CatalogSearch
            params={params}
            searchPlaceholder={searchPlaceholder}
            searchLabel={searchLabel}
          />
          <div className="flex items-center gap-2">
            <FilterTriggerButton
              count={filterCount}
              expanded={filterOpen}
              onClick={() => {
                setSortOpen(false);
                setFilterOpen(true);
              }}
            />
            <SortTriggerButton
              params={params}
              expanded={sortOpen}
              onClick={() => {
                setFilterOpen(false);
                setSortOpen(true);
              }}
            />
          </div>
        </div>

        {/* Desktop — facet pills, then search + sort. */}
        <div className="hidden lg:flex lg:items-center lg:justify-between lg:gap-3">
          <CatalogFilters model={model} />
          <div className="flex items-center gap-2">
            <CatalogSearch
              params={params}
              searchPlaceholder={searchPlaceholder}
              searchLabel={searchLabel}
              className="lg:flex-none"
            />
            <SortMenu params={params} />
          </div>
        </div>
      </div>

      <CatalogFilterSheet
        open={filterOpen}
        onClose={closeFilters}
        model={model}
        resultCount={resultCount}
        resetHref={resetHref}
      />
      <CatalogSortSheet
        open={sortOpen}
        onClose={closeSort}
        params={params}
      />
    </>
  );
}

function FilterTriggerButton({
  count,
  expanded,
  onClick,
}: {
  count: number;
  expanded: boolean;
  onClick: () => void;
}) {
  const active = count > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-haspopup="dialog"
      aria-label={
        count > 0 ? `Filters, ${count} applied` : "Filters"
      }
      className={cn(
        "flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border px-3 text-sm font-bold shadow-sm transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
        active || expanded
          ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
          : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]/80",
      )}
    >
      <SlidersHorizontal aria-hidden className="h-4 w-4 shrink-0" />
      <span>Filters</span>
      {count > 0 && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--primary)] px-1 text-[11px] font-extrabold tabular-nums text-white">
          {count}
        </span>
      )}
    </button>
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
        className="h-11 w-full rounded-full border border-[var(--border)] bg-[var(--card)] pl-10 pr-4 text-sm shadow-sm outline-none transition focus:border-[var(--primary)] lg:h-10 lg:w-64"
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

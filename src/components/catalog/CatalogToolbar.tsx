/**
 * CatalogToolbar — facets · search · sort, the one control bar every browse
 * surface wears.
 *
 * Server component: the two interactive controls inside it own their own client
 * boundaries, so mounting the toolbar costs a page no `"use client"` of its own.
 *
 * Everything it emits is addressed to `params.basePath`, which is what lets the
 * identical bar sit on `/products` and on a collection landing page without
 * either one routing the shopper off its own surface.
 */

import { Search } from "lucide-react";
import { buildCatalogHref, type CatalogParams } from "@/lib/catalog/params";
import {
  CatalogFilters,
  type BrandOption,
  type FacetCounts,
} from "./CatalogFilters";
import { SortMenu } from "./SortMenu";

export function CatalogToolbar({
  params,
  brands,
  counts,
  brandsLabel,
  searchPlaceholder = "Search cases…",
  searchLabel = "Search products",
}: {
  params: CatalogParams;
  brands: BrandOption[];
  counts: FacetCounts;
  brandsLabel?: string;
  searchPlaceholder?: string;
  searchLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <CatalogFilters
        params={params}
        brands={brands}
        counts={counts}
        brandsLabel={brandsLabel}
      />

      <div className="flex items-center gap-2">
        <form action={params.basePath} className="relative flex-1 lg:flex-none">
          {/* Carry every other facet through the search, derived from the
              canonical URL builder so the form can never round-trip a
              different state than a link to the same place would. */}
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
            className="h-10 w-full rounded-full border border-[var(--border)] bg-[var(--card)] pl-10 pr-4 text-sm shadow-sm outline-none transition focus:border-[var(--primary)] lg:w-64"
          />
        </form>
        <SortMenu params={params} />
      </div>
    </div>
  );
}

/**
 * Hidden inputs that carry the non-search facets through the search form.
 *
 * Generated from {@link buildCatalogHref} rather than written out by hand: the
 * form and a link to the same filtered view are then provably the same URL, and
 * adding a facet later can't leave this list quietly behind.
 */
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

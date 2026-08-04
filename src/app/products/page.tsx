import { redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  getCatalogFacetCounts,
  getProducts,
  type ProductQuery,
} from "@/lib/products";
import { getBrandFacets, getCollectionBySlug } from "@/lib/collections";
import { findDevice } from "@/lib/catalog/devices";
import { ProductCard } from "@/components/ProductCard";
import { CatalogToolbar } from "@/components/catalog/CatalogToolbar";
import {
  CatalogSummary,
  buildCatalogChips,
  humanize,
} from "@/components/catalog/CatalogSummary";
import { CatalogPagination } from "@/components/catalog/CatalogPagination";
import { CatalogEmpty } from "@/components/catalog/CatalogEmpty";
import { brandOptionName } from "@/components/catalog/brand-options";
import {
  buildCatalogHref,
  CATALOG_PATH,
  hasActiveFilters,
  parseCatalogParams,
  type CatalogParams,
  type CatalogSearchParams,
} from "@/lib/catalog/params";

export const metadata: Metadata = {
  title: "Shop All",
  description: "Browse all Y2KASE phone cases, charms, and accessories.",
  // Filtered/paginated variants (?tag, ?page, ?sort, …) all consolidate to the
  // canonical catalog URL so search engines don't index thin duplicates.
  alternates: { canonical: CATALOG_PATH },
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  const requested = parseCatalogParams(await searchParams, CATALOG_PATH);

  // Resolve the brand vocabulary first (including stocked characters), then
  // drop any `?brand=` value that isn't one. A facet the catalog can't offer
  // is not a filter, it's a typo: silently ignoring it keeps what the toolbar
  // *shows* and what the query *applies* provably identical. This costs no
  // round-trip — the collection tree is already resolved for the site header
  // in the same render.
  const brands = await getBrandFacets();
  const offered = new Set(
    brands.flatMap((brand) => [
      brand.slug,
      ...(brand.children?.map((child) => child.slug) ?? []),
    ]),
  );
  const params: CatalogParams = {
    ...requested,
    brands: requested.brands.filter((slug) => offered.has(slug)),
  };

  const query: ProductQuery = {
    search: params.q,
    tag: params.tag,
    device: params.device,
    collection: params.collection,
    brands: params.brands,
    magsafe: params.magsafe,
    page: params.page,
    sort: params.sort,
  };

  const characterSlugs = brands.flatMap(
    (brand) => brand.children?.map((child) => child.slug) ?? [],
  );

  const [{ items, total, pageSize }, facetCounts, activeCollection] =
    await Promise.all([
      getProducts(query),
      getCatalogFacetCounts(query, undefined, characterSlugs),
      params.collection
        ? getCollectionBySlug(params.collection)
        : Promise.resolve(null),
    ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // A page number past the end of the result set is always a stale or
  // hand-edited URL — a bookmark from before the catalog shrank, or a crawler
  // walking `?page=` past the last one. Send it to the last real page instead
  // of rendering an empty grid under a nonsense "2353–60 of 60" summary.
  if (total > 0 && params.page > totalPages) {
    redirect(buildCatalogHref(params, { page: totalPages }));
  }

  const activeDevice = params.device ? findDevice(params.device) : undefined;
  const rangeStart = total === 0 ? 0 : (params.page - 1) * pageSize + 1;
  const rangeEnd = Math.min(params.page * pageSize, total);
  const brandName = (slug: string) =>
    brandOptionName(brands, slug) ?? humanize(slug);
  const magsafeLabel =
    params.magsafe === true
      ? "MagSafe"
      : params.magsafe === false
        ? "Non-MagSafe"
        : null;

  const chips = buildCatalogChips(params, {
    brands,
    collectionName: activeCollection?.name,
  });
  const filtered = hasActiveFilters(params);

  /*
   * The page heading is intentionally not painted.
   *
   * The branded hero band that used to carry it pushed the first row of
   * products most of a fold down the page on mobile for no merchandising
   * return — on a catalog you have already navigated to, "Shop All" tells the
   * shopper nothing the products underneath don't. The <h1> itself still ships:
   * it remains the document's outline root for assistive technology and the
   * page's primary heading for crawlers, and it still describes the *filtered*
   * view rather than the route. Deleting it outright would have been a real
   * accessibility and SEO regression dressed up as a visual cleanup.
   */
  const heading = activeDevice
    ? `${activeDevice.label} cases`
    : activeCollection
      ? activeCollection.name
      : params.brands.length === 1
        ? `${brandName(params.brands[0])} cases`
        : magsafeLabel
          ? `${magsafeLabel} cases`
          : params.tag
            ? humanize(params.tag)
            : params.q
              ? `Results for “${params.q}”`
              : "Shop All";

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-6 sm:py-7">
      <h1 className="sr-only">{heading}</h1>

      <CatalogToolbar params={params} brands={brands} counts={facetCounts} />

      <CatalogSummary
        total={total}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        chips={chips}
        resetHref={filtered ? CATALOG_PATH : undefined}
      />

      {items.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <CatalogPagination params={params} totalPages={totalPages} />
        </>
      ) : (
        <CatalogEmpty filtered={filtered} resetHref={CATALOG_PATH} />
      )}
    </div>
  );
}

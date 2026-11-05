import { redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  getCatalogPage,
  type ProductQuery,
} from "@/lib/products";
import { getBrandFacets, getCollectionBySlug } from "@/lib/collections";
import { findDevice, catalogHasMultipleDevices, deviceFilterLabel } from "@/lib/catalog/devices";
import { CatalogToolbar } from "@/components/catalog/CatalogToolbar";
import { buildCatalogChips, humanize } from "@/components/catalog/CatalogSummary";
import { CatalogStream } from "@/components/catalog/CatalogStream";
import { CatalogEmpty } from "@/components/catalog/CatalogEmpty";
import { brandOptionName } from "@/components/catalog/brand-options";
import { colorFamilyLabel, isColorFamilySlug } from "@/lib/catalog/colors";
import { isMotifFamilySlug, motifFamilyLabel } from "@/lib/catalog/motifs";
import { JsonLd } from "@/components/JsonLd";
import {
  breadcrumbJsonLd,
  catalogCanonicalHref,
  catalogPageMetadata,
  collectionPageJsonLd,
  isIndexableCatalogPage,
} from "@/lib/seo";
import { PAGE_COPY } from "@/lib/seo/copy";
import {
  buildCatalogHref,
  CATALOG_PATH,
  dropIncompatibleFacets,
  hasActiveFilters,
  parseCatalogParams,
  type CatalogParams,
  type CatalogSearchParams,
} from "@/lib/catalog/params";
import { ORIGINALS_SLUG } from "@/lib/catalog/collections-config";
import { lookCharacters } from "@/lib/catalog/look-characters";
import { isSoloDesignView } from "@/lib/catalog/look-rail";

/**
 * Faceted catalog: never durable ISR. Each query string is a unique write.
 *
 * This file lives in the `(listing)` group so `loading.tsx` applies only to
 * `/products`, not `/products/[slug]`.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}): Promise<Metadata> {
  const params = parseCatalogParams(await searchParams, CATALOG_PATH);
  return catalogPageMetadata({
    title: PAGE_COPY.catalog.title,
    description: PAGE_COPY.catalog.description,
    params,
  });
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  const [requested, brands] = await Promise.all([
    searchParams.then((value) => parseCatalogParams(value, CATALOG_PATH)),
    getBrandFacets(),
  ]);
  const indexable = isIndexableCatalogPage(requested);
  const canonical = catalogCanonicalHref(requested);

  // Resolve the brand vocabulary first (including stocked characters), then
  // drop any `?brand=` value that isn't one. A facet the catalog can't offer
  // is not a filter, it's a typo: silently ignoring it keeps what the toolbar
  // *shows* and what the query *applies* provably identical. This costs no
  // round-trip — the collection tree is already resolved for the site header
  // in the same render.
  const offered = new Set(
    brands.flatMap((brand) => [
      brand.slug,
      ...(brand.children?.map((child) => child.slug) ?? []),
    ]),
  );
  offered.add(ORIGINALS_SLUG);
  const scoped: CatalogParams = {
    ...requested,
    brands: requested.brands.filter((slug) => offered.has(slug)),
  };
  const params = dropIncompatibleFacets(scoped);
  if (params !== scoped) {
    redirect(buildCatalogHref(params));
  }

  const query: ProductQuery = {
    search: params.q,
    tag: params.tag,
    device: params.device,
    collection: params.collection,
    brands: params.brands,
    colors: params.colors.filter(isColorFamilySlug),
    motifs: params.motifs.filter(isMotifFamilySlug),
    magsafe: params.magsafe,
    page: params.page,
    sort: params.sort,
  };

  const characterSlugs = brands.flatMap(
    (brand) => brand.children?.map((child) => child.slug) ?? [],
  );

  const [{ items, total, pageSize, facetCounts }, activeCollection] =
    await Promise.all([
      getCatalogPage(query, undefined, [...characterSlugs, ORIGINALS_SLUG]),
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
  const soloDesign = isSoloDesignView(params);
  const showDeviceBadge =
    catalogHasMultipleDevices(facetCounts.devices) && !params.device;

  /*
   * Shop All stays untitled. A hero that said "Shop All" pushed the first
   * cases off the phone for no merchandising return. The <h1> still ships
   * for assistive technology and crawlers. It becomes visible only when one
   * design facet is the entire view ("Hello Kitty cases", "Pink cases"),
   * which is the moment the title tells the shopper something the grid does
   * not already say.
   */
  const heading = activeDevice
    ? deviceFilterLabel(activeDevice.id)
    : activeCollection
      ? activeCollection.name
      : params.brands.length === 1
        ? `${brandName(params.brands[0])} cases`
        : magsafeLabel
          ? `${magsafeLabel} cases`
          : params.colors.length === 1
            ? `${colorFamilyLabel(params.colors[0]!)} cases`
            : params.motifs.length === 1
              ? `${motifFamilyLabel(params.motifs[0]!)} cases`
            : params.tag
            ? humanize(params.tag)
              : params.q
              ? `Results for “${params.q}”`
              : PAGE_COPY.catalog.heading;

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-4 sm:px-6 sm:py-6">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", url: "/" },
            { name: "Shop", url: CATALOG_PATH },
          ]),
          ...(indexable
            ? [
                collectionPageJsonLd({
                  name: heading,
                  description: PAGE_COPY.catalog.description,
                  url: canonical,
                  items: items.map((product) => ({
                    name: product.title,
                    url: `/products/${product.slug}`,
                  })),
                }),
              ]
            : []),
        ]}
      />
      <CatalogToolbar
        params={params}
        brands={brands}
        counts={facetCounts}
        resultCount={total}
        characters={lookCharacters(brands, facetCounts.brands, params.brands)}
        flushTop
      />

      <h1
        className={
          soloDesign
            ? "mt-3 text-xl font-black leading-none tracking-tight sm:text-2xl"
            : "sr-only"
        }
      >
        {heading}
      </h1>

      {items.length > 0 ? (
        <CatalogStream
          key={JSON.stringify(query)}
          items={items}
          total={total}
          page={params.page}
          pageSize={pageSize}
          query={query}
          params={params}
          chips={chips}
          resetHref={filtered ? CATALOG_PATH : undefined}
          showDeviceBadge={showDeviceBadge}
        />
      ) : (
        <CatalogEmpty filtered={filtered} resetHref={CATALOG_PATH} />
      )}
    </div>
  );
}

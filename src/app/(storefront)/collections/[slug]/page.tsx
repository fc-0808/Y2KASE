import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import type { Collection } from "@/lib/db/schema";
import { CatalogIdentityLandingSkeleton } from "@/components/catalog/CatalogChromeSkeleton";
import {
  getCollectionBySlug,
  getCollectionTree,
  getCollectionBreadcrumb,
  type CollectionNode,
} from "@/lib/collections";
import { getCatalogPage, type ProductQuery } from "@/lib/products";
import { isColorFamilySlug } from "@/lib/catalog/colors";
import { isMotifFamilySlug } from "@/lib/catalog/motifs";
import { ProductCard, PRODUCT_MOSAIC } from "@/components/ProductCard";
import { JsonLd } from "@/components/JsonLd";
import {
  breadcrumbJsonLd,
  catalogCanonicalHref,
  catalogPageMetadata,
  collectionPageJsonLd,
  FACET_PAGE_ROBOTS,
  isIndexableCatalogPage,
} from "@/lib/seo";
import { collectionSeo, collectionBrowseTagline, collectionFilteredTitle } from "@/lib/seo/copy";
import { CatalogToolbar } from "@/components/catalog/CatalogToolbar";
import {
  CatalogSummary,
  buildCatalogChips,
} from "@/components/catalog/CatalogSummary";
import { CatalogPagination } from "@/components/catalog/CatalogPagination";
import { CatalogEmpty } from "@/components/catalog/CatalogEmpty";
import { CollectionEditorialBlock } from "@/components/CollectionEditorialBlock";
import { collectionEditorial } from "@/lib/seo/collection-editorial";
import {
  buildCatalogHref,
  dropIncompatibleFacets,
  hasActiveFilters,
  parseCatalogParams,
  type CatalogParams,
  type CatalogSearchParams,
} from "@/lib/catalog/params";
import {
  catalogHasMultipleDevices,
  stockedDeviceIds,
} from "@/lib/catalog/devices";

/** Faceted collection landings: never durable ISR. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<CatalogSearchParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [collection, tree, rawSearchParams] = await Promise.all([
    getCollectionBySlug(slug),
    getCollectionTree().catch(() => []),
    searchParams,
  ]);
  if (!collection) notFound();
  const catalogParams = parseCatalogParams(
    rawSearchParams,
    `/collections/${slug}`,
  );
  let stocked: string[] = [];
  try {
    const { facetCounts } = await getCatalogPage({
      collection: slug,
      page: 1,
      sort: "newest",
    });
    stocked = stockedDeviceIds(facetCounts.devices);
  } catch {
    stocked = [];
  }
  const seoInput = { ...collection, stockedDeviceIds: stocked };
  const copy = collectionSeo(seoInput);
  const catalogMetadata = catalogPageMetadata({
    title: collectionFilteredTitle(seoInput, catalogParams.device),
    description: copy.description,
    params: catalogParams,
    openGraphImage: null,
  });
  const node = findNode(tree, slug);

  return node?.totalCount === 0
    ? { ...catalogMetadata, robots: FACET_PAGE_ROBOTS }
    : catalogMetadata;
}

/** Depth-first lookup of one node in the collection forest. */
function findNode(nodes: CollectionNode[], slug: string): CollectionNode | null {
  for (const node of nodes) {
    if (node.slug === slug) return node;
    const hit = findNode(node.children, slug);
    if (hit) return hit;
  }
  return null;
}

/** "character" → "Characters", for the facet trigger. */
function facetLabel(kind: string | undefined): string {
  if (!kind) return "Collections";
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}s`;
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<CatalogSearchParams>;
}) {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (!collection) notFound();

  return (
    <Suspense fallback={<CatalogIdentityLandingSkeleton />}>
      <CollectionCatalog
        collection={collection}
        searchParams={searchParams}
      />
    </Suspense>
  );
}

async function CollectionCatalog({
  collection,
  searchParams,
}: {
  collection: Collection;
  searchParams: Promise<CatalogSearchParams>;
}) {
  const slug = collection.slug;
  const basePath = `/collections/${slug}`;

  // The tree is what makes this page a catalog rather than a list: it carries
  // each child's `totalCount`, which is both the facet vocabulary and the
  // evidence that a child is worth offering. `SiteHeader` has already awaited
  // this exact call to build the mega-menu, so React's request-level `cache`
  // usually hands it straight back — the products query waiting on it costs a
  // map lookup, not a round trip.
  const [tree, breadcrumb] = await Promise.all([
    getCollectionTree().catch(() => []),
    getCollectionBreadcrumb(collection),
  ]);

  // Stocked children only: the taxonomy classifies IP before we stock it, so an
  // unfiltered vocabulary would offer facets that can only ever return nothing.
  // Same rule `getBrandFacets` and the nav drawer apply.
  const children = (findNode(tree, slug)?.children ?? []).filter(
    (child) => child.totalCount > 0,
  );

  /*
   * This page is `/products` scoped to one branch of the taxonomy, so it runs
   * the same URL state — with one deliberate difference.
   *
   * `collection` is blanked. The route already says which collection this is;
   * leaving it in the state would double-apply the narrowing and, worse, render
   * a removable filter chip whose "clear" link leads back to the page it is
   * already on. The scoping is instead passed straight to the query below,
   * where it is not the shopper's to remove.
   *
   * The subtree facet is re-pointed from top-level brands to this collection's
   * own children, which is the only narrowing that means anything here: inside
   * Sanrio, "Kuromi" is a useful filter and "Miffy" would return nothing. Both
   * travel through the same `?brand=` parameter because both are collection
   * subtrees OR-ed together — the mechanism never cared what the taxonomy calls
   * the level it is filtering on.
   */
  const requested = parseCatalogParams(await searchParams, basePath);
  const indexable = isIndexableCatalogPage(requested);
  const canonical = catalogCanonicalHref(requested);
  const offered = new Set(children.map((child) => child.slug));
  const scoped: CatalogParams = {
    ...requested,
    collection: undefined,
    brands: requested.brands.filter((s) => offered.has(s)),
  };
  const catalogParams = dropIncompatibleFacets(scoped);
  if (catalogParams !== scoped) {
    redirect(buildCatalogHref(catalogParams));
  }

  const query: ProductQuery = {
    search: catalogParams.q,
    tag: catalogParams.tag,
    device: catalogParams.device,
    collection: slug,
    brands: catalogParams.brands,
    colors: catalogParams.colors.filter(isColorFamilySlug),
    motifs: catalogParams.motifs.filter(isMotifFamilySlug),
    magsafe: catalogParams.magsafe,
    page: catalogParams.page,
    sort: catalogParams.sort,
  };

  const { items, total, pageSize, facetCounts } = await getCatalogPage(
    query,
    children.map((child) => child.slug),
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Stale bookmark or a crawler walking `?page=` past the end — send it to the
  // last real page rather than an empty grid under a nonsense summary.
  if (total > 0 && catalogParams.page > totalPages) {
    redirect(buildCatalogHref(catalogParams, { page: totalPages }));
  }

  const accent = collection.accentColor ?? "var(--primary)";
  const rangeStart = total === 0 ? 0 : (catalogParams.page - 1) * pageSize + 1;
  const rangeEnd = Math.min(catalogParams.page * pageSize, total);
  const filtered = hasActiveFilters(catalogParams);
  const chips = buildCatalogChips(catalogParams, { brands: children });
  const stocked = stockedDeviceIds(facetCounts.devices);
  const seoInput = { ...collection, stockedDeviceIds: stocked };
  const copy = collectionSeo(seoInput);
  const tagline = collectionBrowseTagline(seoInput, stocked);
  const showDeviceBadge =
    catalogHasMultipleDevices(facetCounts.devices) && !catalogParams.device;
  const parent =
    breadcrumb.length >= 2 ? breadcrumb[breadcrumb.length - 2] : null;
  const editorial = collectionEditorial({
    slug: collection.slug,
    name: collection.name,
    kind: collection.kind,
    parent,
    stockedDeviceIds: stocked,
  });

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-4 sm:px-6 sm:py-6">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", url: "/" },
            { name: "Collections", url: "/collections" },
            ...breadcrumb.map((c) => ({
              name: c.name,
              url: `/collections/${c.slug}`,
            })),
          ]),
          ...(indexable && total > 0
            ? [
                collectionPageJsonLd({
                  name: copy.heading,
                  description: copy.description,
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

      {/* Identity band: where you are and what this is. The product count lives
          in the result summary below instead of here — with filters on the page
          a fixed "41 products" beside the title would contradict the "1–8 of 8"
          directly under it. The concise description remains visible because
          on-page content, not hidden metadata, is what shoppers and answer
          engines can evaluate and quote. */}
      <header
        className="mb-3 overflow-hidden rounded-2xl border border-[var(--border)] px-3 py-3 sm:mb-4 sm:rounded-3xl sm:px-6 sm:py-4"
        style={{
          // `color-mix`, not `${accent}1f`: `accentColor` is nullable
          // (`taxonomy-sync` writes `?? null`), so this can resolve to
          // `var(--primary)`, which no appended hex alpha can express.
          // `var(--primary)1f` is an invalid stop and drops the whole gradient.
          background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 12%, transparent), transparent 70%)`,
        }}
      >
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-1 text-xs text-[var(--foreground)]/65 sm:text-sm"
        >
          <Link href="/collections" className="hover:text-[var(--primary)]">
            Collections
          </Link>
          {breadcrumb.map((c, i) => {
            const isCurrent = i === breadcrumb.length - 1;
            return (
              <span key={c.id} className="flex items-center gap-1">
                <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0" />
                {isCurrent ? (
                  <span
                    aria-current="page"
                    className="font-semibold text-[var(--foreground)]"
                  >
                    {c.name}
                  </span>
                ) : (
                  <Link
                    href={`/collections/${c.slug}`}
                    className="hover:text-[var(--primary)]"
                  >
                    {c.name}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>
        <h1 className="mt-1.5 text-xl font-black sm:text-3xl">
          {copy.heading}
        </h1>
        <p className="mt-1 line-clamp-2 max-w-3xl text-sm leading-relaxed text-[var(--foreground)]/70 sm:mt-1.5 sm:line-clamp-none sm:text-base">
          {tagline}
        </p>
      </header>

      <CatalogToolbar
        params={catalogParams}
        brands={children}
        counts={facetCounts}
        brandsLabel={facetLabel(children[0]?.kind)}
        searchPlaceholder={`Search ${collection.name}…`}
        searchLabel={`Search ${collection.name} products`}
        resultCount={total}
        resetHref={filtered ? basePath : undefined}
      />

      <CatalogSummary
        total={total}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        chips={chips}
        resetHref={filtered ? basePath : undefined}
      />

      {items.length > 0 ? (
        <>
          <div className={PRODUCT_MOSAIC}>
            {items.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                imagePriority={index === 0}
                headingLevel={2}
                showDeviceBadge={showDeviceBadge}
              />
            ))}
          </div>
          <CatalogPagination params={catalogParams} totalPages={totalPages} />
        </>
      ) : (
        <CatalogEmpty
          filtered={filtered}
          resetHref={basePath}
          icon={collection.icon ?? "🔍"}
        />
      )}

      {/*
        Links to the children's own landing pages, below the grid.

        The facet above narrows in place, which is the right default — but a
        shopper who only wants Hello Kitty is better served by a page with its
        own heading, artwork and metadata than by a filtered view of Sanrio. The
        two are not redundant, they are a filter and a destination, and putting
        the destinations after the products keeps them from competing with the
        controls for the fold.
      */}
      {children.length > 0 && (
        <section className="mt-12 border-t border-[var(--border)] pt-6">
          <h2 className="mb-3 text-lg font-black">
            Shop {collection.name} by {facetLabel(children[0]?.kind).toLowerCase().replace(/s$/, "")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {children.map((child) => (
              <Link
                key={child.id}
                href={`/collections/${child.slug}`}
                aria-label={`${child.name} — ${child.totalCount} product${
                  child.totalCount === 1 ? "" : "s"
                }`}
                className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3.5 py-1.5 text-sm font-semibold shadow-sm transition hover:border-[var(--primary)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
              >
                {child.name}
                <span className="text-xs font-bold tabular-nums text-[var(--foreground)]/45">
                  {child.totalCount}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <CollectionEditorialBlock editorial={editorial} />
    </div>
  );
}

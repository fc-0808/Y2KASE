import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import type { Collection } from "@/lib/db/schema";
import { CatalogIdentityLandingSkeleton } from "@/components/catalog/CatalogChromeSkeleton";
import {
  getCollectionBreadcrumb,
  getCollectionBySlug,
  getCollectionTree,
  type CollectionNode,
} from "@/lib/collections";
import { getCatalogPage, type ProductQuery } from "@/lib/products";
import { isColorFamilySlug } from "@/lib/catalog/colors";
import { isMotifFamilySlug } from "@/lib/catalog/motifs";
import { ProductCard, PRODUCT_MOSAIC } from "@/components/ProductCard";
import { JsonLd } from "@/components/JsonLd";
import { CatalogToolbar } from "@/components/catalog/CatalogToolbar";
import {
  CatalogSummary,
  buildCatalogChips,
} from "@/components/catalog/CatalogSummary";
import { CatalogPagination } from "@/components/catalog/CatalogPagination";
import { CatalogEmpty } from "@/components/catalog/CatalogEmpty";
import {
  breadcrumbJsonLd,
  catalogCanonicalHref,
  catalogPageMetadata,
  collectionPageJsonLd,
  faqJsonLd,
  isIndexableCatalogPage,
} from "@/lib/seo";
import {
  IPHONE_18_COLLECTIONS,
  IPHONE_18_FIT_SLUG,
  iphone18FitCopy,
  iphone18FitHeading,
  iphone18FitPath,
  isIphone18CollectionSlug,
  isIphone18FitSlug,
  type Iphone18CollectionSlug,
} from "@/lib/seo/fit-landings";
import {
  buildCatalogHref,
  dropIncompatibleFacets,
  hasActiveFilters,
  parseCatalogParams,
  type CatalogParams,
  type CatalogSearchParams,
} from "@/lib/catalog/params";

/**
 * iPhone 18 character landings.
 *
 * The route already scopes the grid to one collection and to iPhone cases.
 * Sort, search, and the other facets use the same URL state as
 * `/collections/{slug}` — written back onto this path, and omitted from the
 * indexable URL. `device` and `collection` stay out of that state: they are
 * the page, not filters a shopper can clear.
 */
export const dynamic = "force-dynamic";
export const dynamicParams = false;

export function generateStaticParams() {
  return IPHONE_18_COLLECTIONS.map((entry) => ({
    slug: entry.slug,
    fit: IPHONE_18_FIT_SLUG,
  }));
}

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

/** Stocked children of this collection — the only subtree facet that can match. */
function stockedChildren(
  tree: CollectionNode[],
  slug: string,
): CollectionNode[] {
  return (findNode(tree, slug)?.children ?? []).filter(
    (child) => child.totalCount > 0,
  );
}

/**
 * Blank the facets this route already applies, and drop brand slugs it cannot
 * offer. Callers redirect when the resulting href differs from the request.
 */
function scopeFitCatalog(
  requested: CatalogParams,
  offered: ReadonlySet<string>,
): CatalogParams {
  return dropIncompatibleFacets({
    ...requested,
    device: undefined,
    collection: undefined,
    brands: requested.brands.filter((slug) => offered.has(slug)),
  });
}

type FitCatalogState = {
  basePath: string;
  children: CollectionNode[];
  catalogParams: CatalogParams;
};

async function readFitCatalog(
  slug: string,
  searchParams: Promise<CatalogSearchParams>,
): Promise<FitCatalogState> {
  const basePath = iphone18FitPath(slug);
  const [raw, tree] = await Promise.all([
    searchParams,
    getCollectionTree().catch(() => [] as CollectionNode[]),
  ]);
  const requested = parseCatalogParams(raw, basePath);
  const children = stockedChildren(tree, slug);
  const catalogParams = scopeFitCatalog(
    requested,
    new Set(children.map((child) => child.slug)),
  );
  if (buildCatalogHref(catalogParams) !== buildCatalogHref(requested)) {
    redirect(buildCatalogHref(catalogParams));
  }
  return { basePath, children, catalogParams };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; fit: string }>;
  searchParams: Promise<CatalogSearchParams>;
}): Promise<Metadata> {
  const { slug, fit } = await params;
  if (!isIphone18FitSlug(fit) || !isIphone18CollectionSlug(slug)) notFound();
  const [collection, { catalogParams }] = await Promise.all([
    getCollectionBySlug(slug),
    readFitCatalog(slug, searchParams),
  ]);
  if (!collection) notFound();
  const copy = iphone18FitCopy(collection.name, slug);
  return catalogPageMetadata({
    title: copy.title,
    description: copy.description,
    params: catalogParams,
    openGraphImage: null,
  });
}

export default async function Iphone18FitPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; fit: string }>;
  searchParams: Promise<CatalogSearchParams>;
}) {
  const { slug, fit } = await params;
  if (!isIphone18FitSlug(fit) || !isIphone18CollectionSlug(slug)) notFound();
  const [collection, fitState] = await Promise.all([
    getCollectionBySlug(slug),
    readFitCatalog(slug, searchParams),
  ]);
  if (!collection) notFound();

  return (
    <Suspense fallback={<CatalogIdentityLandingSkeleton />}>
      <Iphone18FitCatalog
        collection={collection}
        slug={slug}
        fitState={fitState}
      />
    </Suspense>
  );
}

async function Iphone18FitCatalog({
  collection,
  slug,
  fitState,
}: {
  collection: Collection;
  slug: Iphone18CollectionSlug;
  fitState: FitCatalogState;
}) {
  const { basePath, children, catalogParams } = fitState;
  const indexable = isIndexableCatalogPage(catalogParams);
  const canonical = catalogCanonicalHref(catalogParams);

  const query: ProductQuery = {
    search: catalogParams.q,
    tag: catalogParams.tag,
    device: "iphone",
    collection: slug,
    brands: catalogParams.brands,
    colors: catalogParams.colors.filter(isColorFamilySlug),
    motifs: catalogParams.motifs.filter(isMotifFamilySlug),
    magsafe: catalogParams.magsafe,
    page: catalogParams.page,
    sort: catalogParams.sort,
  };

  const [{ items, total, pageSize, facetCounts }, breadcrumb] =
    await Promise.all([
      getCatalogPage(
        query,
        children.map((child) => child.slug),
      ),
      getCollectionBreadcrumb(collection),
    ]);

  const filtered = hasActiveFilters(catalogParams);
  if (total === 0 && !filtered) notFound();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total > 0 && catalogParams.page > totalPages) {
    redirect(buildCatalogHref(catalogParams, { page: totalPages }));
  }

  const brandOptions = children.filter(
    (child) =>
      (facetCounts.brands[child.slug] ?? 0) > 0 ||
      catalogParams.brands.includes(child.slug),
  );
  const copy = iphone18FitCopy(collection.name, slug);
  const accent = collection.accentColor ?? "var(--primary)";
  const rangeStart = total === 0 ? 0 : (catalogParams.page - 1) * pageSize + 1;
  const rangeEnd = Math.min(catalogParams.page * pageSize, total);
  const chips = buildCatalogChips(catalogParams, { brands: brandOptions });
  const chipClass =
    "inline-flex min-h-11 shrink-0 items-center rounded-full border border-[var(--border)] bg-[var(--card)] px-3.5 text-sm font-semibold shadow-sm transition hover:border-[var(--primary)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2";
  const crumbs = [
    { name: "Home", url: "/" },
    { name: "Collections", url: "/collections" },
    ...breadcrumb.map((entry) => ({
      name: entry.name,
      url: `/collections/${entry.slug}`,
    })),
    { name: "iPhone 18 Pro", url: basePath },
  ];

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1800px] px-4 py-4 sm:px-6 sm:py-6">
      <JsonLd
        data={[
          breadcrumbJsonLd(crumbs),
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
          ...(indexable && catalogParams.page === 1
            ? [faqJsonLd(copy.faqs)]
            : []),
        ]}
      />

      <header
        className="mb-3 min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] px-3.5 py-3 sm:mb-4 sm:rounded-3xl sm:px-6 sm:py-4"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 16%, transparent), transparent 72%)`,
        }}
      >
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-1 text-xs text-[var(--foreground)]/55"
        >
          <Link
            href={`/collections/${slug}`}
            className="truncate hover:text-[var(--primary)]"
          >
            {collection.name}
          </Link>
          <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span
            aria-current="page"
            className="shrink-0 font-semibold text-[var(--foreground)]"
          >
            iPhone 18
          </span>
        </nav>
        <h1 className="mt-1.5 min-w-0 text-[1.65rem] font-black leading-none tracking-tight sm:text-4xl">
          <span className="sr-only">{copy.heading}</span>
          <span aria-hidden="true" className="block truncate">
            {collection.name}
          </span>
        </h1>
        <p className="mt-1 text-sm font-medium text-[var(--foreground)]/65">
          Pro & Pro Max
        </p>
      </header>

      <CatalogToolbar
        params={catalogParams}
        brands={brandOptions}
        counts={facetCounts}
        brandsLabel={facetLabel(children[0]?.kind)}
        lockedDevice="iphone"
        searchPlaceholder={`Search ${collection.name}…`}
        searchLabel={`Search ${collection.name} iPhone 18 cases`}
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
                showDeviceBadge={false}
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

      <section className="mt-8 min-w-0 max-w-3xl border-t border-[var(--border)] pt-6 sm:mt-12">
        <h2 className="text-base font-black sm:text-lg">Keep shopping</h2>
        <nav
          aria-label="Related collections"
          className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
        >
          <Link href={`/collections/${slug}`} className={chipClass}>
            All {collection.name}
          </Link>
          {IPHONE_18_COLLECTIONS.filter((entry) => entry.slug !== slug).map(
            (entry) => (
              <Link
                key={entry.slug}
                href={iphone18FitPath(entry.slug)}
                aria-label={iphone18FitHeading(entry.name)}
                className={chipClass}
              >
                {entry.name}
              </Link>
            ),
          )}
          <Link href="/devices/iphone" className={chipClass}>
            All iPhone cases
          </Link>
        </nav>
        <div className="mt-6 space-y-3">
          {copy.paragraphs.map((paragraph) => (
            <p
              key={paragraph}
              className="text-pretty text-sm leading-relaxed text-[var(--foreground)]/75 sm:text-base"
            >
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      {indexable && catalogParams.page === 1 && (
        <section className="mt-8 max-w-3xl sm:mt-10">
          <h2 className="text-lg font-black">Questions</h2>
          <div className="mt-3 space-y-3">
            {copy.faqs.map((faq) => (
              <article
                key={faq.question}
                className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3.5"
              >
                <h3 className="text-[15px] font-bold leading-snug">
                  {faq.question}
                </h3>
                <p className="mt-1.5 text-pretty text-sm leading-relaxed text-[var(--foreground)]/75">
                  {faq.answer}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

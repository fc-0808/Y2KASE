import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { DEVICE_FAMILIES, deviceOffersMagSafe, findDevice } from "@/lib/catalog/devices";
import { isColorFamilySlug } from "@/lib/catalog/colors";
import { isMotifFamilySlug } from "@/lib/catalog/motifs";
import { deviceSeo } from "@/lib/seo/device-content";
import { getCatalogPage, type ProductQuery } from "@/lib/products";
import { getBrandFacets } from "@/lib/collections";
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
  buildCatalogHref,
  hasActiveFilters,
  parseCatalogParams,
  type CatalogParams,
  type CatalogSearchParams,
} from "@/lib/catalog/params";

/** Faceted device landings: never durable ISR. */
export const dynamic = "force-dynamic";
// generateStaticParams only enumerates the allow-list for `dynamicParams =
// false`. Combined with force-dynamic it does not write ISR for each device.
export const dynamicParams = false;

/** Merchandised devices get a generated route; stock is checked at request. */
function merchandisedDeviceIds(): string[] {
  return DEVICE_FAMILIES.flatMap((f) => f.devices)
    .filter((d) => !d.comingSoon)
    .map((d) => d.id);
}

export function generateStaticParams() {
  return merchandisedDeviceIds().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<CatalogSearchParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const device = findDevice(slug);
  if (!device) return { title: "Not found" };
  const seo = deviceSeo(slug, device.label);
  return catalogPageMetadata({
    title: seo.heading,
    description: seo.intro,
    params: parseCatalogParams(await searchParams, `/devices/${slug}`),
    openGraphImage: null,
  });
}

export default async function DeviceLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<CatalogSearchParams>;
}) {
  const { slug } = await params;
  const device = findDevice(slug);
  if (!device || device.comingSoon) notFound();

  const basePath = `/devices/${slug}`;
  const seo = deviceSeo(slug, device.label);

  // The brand vocabulary is resolved from the same cached collection tree the
  // site header already awaited this render, so offering the full faceted
  // toolbar here costs no extra round trip.
  const [requested, brands] = await Promise.all([
    searchParams.then((value) => parseCatalogParams(value, basePath)),
    getBrandFacets(),
  ]);
  const indexable = isIndexableCatalogPage(requested);
  const canonical = catalogCanonicalHref(requested);

  /*
   * This page is `/products` scoped to one device, so it runs the same URL
   * state — with two facets deliberately blanked.
   *
   * `device` is the route. Leaving it in the state would double-apply the
   * narrowing and render a removable chip whose "clear" link leads back to the
   * page it is already on; it is passed straight to the query below instead,
   * where it is not the shopper's to remove. `collection` goes with it: this
   * surface offers collection narrowing through the brand facet (`?brand=`),
   * which is the same mechanism with a control attached, so honouring a second
   * spelling of it would apply a filter the toolbar never shows.
   *
   * Brand slugs the catalog can't offer are dropped for the same reason
   * `/products` drops them — a facet with no option is a typo, not a filter,
   * and ignoring it keeps what the toolbar shows and what the query applies
   * provably identical.
   */
  const offered = new Set(
    brands.flatMap((brand) => [
      brand.slug,
      ...(brand.children?.map((child) => child.slug) ?? []),
    ]),
  );
  const scoped: CatalogParams = {
    ...requested,
    device: undefined,
    collection: undefined,
    brands: requested.brands.filter((brandSlug) => offered.has(brandSlug)),
  };
  // The route, not the URL, names the device — drop MagSafe here the same
  // way `dropIncompatibleFacets` would if `?device=` were still in state.
  const catalogParams =
    !deviceOffersMagSafe(slug) && scoped.magsafe !== undefined
      ? { ...scoped, magsafe: undefined }
      : scoped;
  if (catalogParams !== scoped) {
    redirect(buildCatalogHref(catalogParams));
  }

  const query: ProductQuery = {
    search: catalogParams.q,
    tag: catalogParams.tag,
    device: slug,
    brands: catalogParams.brands,
    colors: catalogParams.colors.filter(isColorFamilySlug),
    motifs: catalogParams.motifs.filter(isMotifFamilySlug),
    magsafe: catalogParams.magsafe,
    page: catalogParams.page,
    sort: catalogParams.sort,
  };

  const characterSlugs = brands.flatMap(
    (brand) => brand.children?.map((child) => child.slug) ?? [],
  );

  const { items, total, pageSize, facetCounts } = await getCatalogPage(
    query,
    undefined,
    characterSlugs,
  );

  const filtered = hasActiveFilters(catalogParams);
  // An unstocked line must not occupy an indexable URL. Filtered emptiness
  // (MagSafe on a real grid, a brand with no SKUs) still shows CatalogEmpty.
  if (total === 0 && !filtered) notFound();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Stale bookmark or a crawler walking `?page=` past the end — send it to the
  // last real page rather than an empty grid under a nonsense summary.
  if (total > 0 && catalogParams.page > totalPages) {
    redirect(buildCatalogHref(catalogParams, { page: totalPages }));
  }

  const rangeStart = total === 0 ? 0 : (catalogParams.page - 1) * pageSize + 1;
  const rangeEnd = Math.min(catalogParams.page * pageSize, total);
  const chips = buildCatalogChips(catalogParams, { brands });

  // Destination links below the grid, counted under this device rather than the
  // whole catalog: a brand with no cases for this phone would otherwise be
  // offered here as a dead end. These are the same numbers the brand facet
  // shows, so the links and the menu can never disagree.
  const brandLinks = brands
    .map((brand) => ({ ...brand, count: facetCounts.brands[brand.slug] ?? 0 }))
    .filter((brand) => brand.count > 0);

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-4 sm:px-6 sm:py-6">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", url: "/" },
            { name: "Shop", url: "/products" },
            { name: seo.heading, url: basePath },
          ]),
          ...(indexable && total > 0
            ? [
                collectionPageJsonLd({
                  name: seo.heading,
                  description: seo.intro,
                  url: canonical,
                  items: items.map((product) => ({
                    name: product.title,
                    url: `/products/${product.slug}`,
                  })),
                }),
              ]
            : []),
          ...(indexable && catalogParams.page === 1 && seo.faqs.length > 0
            ? [faqJsonLd(seo.faqs)]
            : []),
        ]}
      />

      {/* Identity band: where you are and what this is, in two lines. The
          design count that used to sit here now lives in the result summary
          below — with filters on the page a fixed "108 designs" beside the
          title would contradict the "1–24 of 40" directly under it — and the
          long-form intro moved below the grid, where it no longer pushes the
          first row of products off a phone screen. */}
      <header
        className="mb-3 overflow-hidden rounded-2xl border border-[var(--border)] px-3 py-3 sm:mb-4 sm:rounded-3xl sm:px-6 sm:py-4"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--primary) 12%, transparent), transparent 70%)",
        }}
      >
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-1 text-xs text-[var(--foreground)]/65 sm:text-sm"
        >
          <Link href="/" className="hover:text-[var(--primary)]">
            Home
          </Link>
          <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <Link href="/products" className="hover:text-[var(--primary)]">
            Shop
          </Link>
          <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span
            aria-current="page"
            className="font-semibold text-[var(--foreground)]"
          >
            {seo.heading}
          </span>
        </nav>
        <h1 className="mt-1.5 text-xl font-black sm:text-3xl">
          {seo.heading}
        </h1>
        <p className="mt-1 line-clamp-2 max-w-3xl text-sm leading-relaxed text-[var(--foreground)]/70 sm:mt-1.5 sm:line-clamp-none sm:text-base">
          {seo.tagline}
        </p>
      </header>

      <CatalogToolbar
        params={catalogParams}
        brands={brands}
        counts={facetCounts}
        lockedDevice={slug}
        searchPlaceholder={`Search ${device.label} cases…`}
        searchLabel={`Search ${device.label} cases`}
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
          icon={device.icon}
        />
      )}

      {/*
        Brand landing pages, below the grid.

        The facet above narrows in place, which is the right default — but a
        shopper who only wants Sanrio is better served by a page with its own
        heading, artwork and metadata than by a filtered view of this one. The
        two are a filter and a destination, not a duplicate, and keeping the
        destinations under the products stops them competing with the controls
        for the fold.
      */}
      {brandLinks.length > 0 && (
        <section className="mt-12 border-t border-[var(--border)] pt-6">
          <h2 className="mb-3 text-lg font-black">
            Shop {device.label} cases by brand
          </h2>
          <div className="flex flex-wrap gap-2">
            {brandLinks.map((brand) => (
              <Link
                key={brand.slug}
                href={`/collections/${brand.slug}`}
                aria-label={`${brand.name} — ${brand.count} product${
                  brand.count === 1 ? "" : "s"
                }`}
                className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3.5 py-1.5 text-sm font-semibold shadow-sm transition hover:border-[var(--primary)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
              >
                {brand.icon && <span aria-hidden>{brand.icon}</span>}
                {brand.name}
                <span className="text-xs font-bold tabular-nums text-[var(--foreground)]/45">
                  {brand.count}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Long-form copy + the exact fit list: unique, quotable on-page content
          for shoppers and answer engines, kept out of the shopper's way. */}
      <section className="mt-10 max-w-3xl">
        <h2 className="mb-3 text-lg font-black">About {seo.heading}</h2>
        <p className="text-sm leading-relaxed text-[var(--foreground)]/75">
          {seo.intro}
        </p>
        {seo.models && seo.models.length > 0 && (
          <p className="mt-3 text-sm leading-relaxed text-[var(--foreground)]/70">
            <span className="font-bold text-[var(--foreground)]">
              Compatible models:{" "}
            </span>
            {seo.models.join(" · ")}. Select your exact model on any product
            page.
          </p>
        )}
      </section>

      {seo.faqs.length > 0 && (
        <section className="mt-10 max-w-3xl">
          <h2 className="mb-4 text-xl font-black">{seo.heading} — FAQ</h2>
          <div className="space-y-5">
            {seo.faqs.map((faq) => (
              <div key={faq.question}>
                <h3 className="text-sm font-bold sm:text-base">
                  {faq.question}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-[var(--foreground)]/75">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

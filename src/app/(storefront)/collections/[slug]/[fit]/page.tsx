import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getCollectionBreadcrumb, getCollectionBySlug } from "@/lib/collections";
import { getCatalogPage } from "@/lib/products";
import { ProductCard, PRODUCT_MOSAIC } from "@/components/ProductCard";
import { JsonLd } from "@/components/JsonLd";
import { CatalogPagination } from "@/components/catalog/CatalogPagination";
import {
  breadcrumbJsonLd,
  catalogPageMetadata,
  collectionPageJsonLd,
  faqJsonLd,
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
import type { CatalogParams } from "@/lib/catalog/params";

/** One indexable URL per character. Facet query strings are not this page. */
export const dynamic = "force-dynamic";
export const dynamicParams = false;

export function generateStaticParams() {
  return IPHONE_18_COLLECTIONS.map((entry) => ({
    slug: entry.slug,
    fit: IPHONE_18_FIT_SLUG,
  }));
}

type FitSearchParams = Record<string, string | string[] | undefined>;

function cleanFitPage(sp: FitSearchParams): { page: number; dirty: boolean } {
  const dirty = Object.entries(sp).some(([key, value]) => {
    if (key === "page" || value === undefined) return false;
    return Array.isArray(value) ? value.length > 0 : value !== "";
  });
  const raw = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const page = Number(raw);
  return {
    page: Number.isInteger(page) && page > 1 ? Math.min(page, 1_000) : 1,
    dirty,
  };
}

function fitCatalogParams(basePath: string, page: number): CatalogParams {
  return {
    basePath,
    brands: [],
    colors: [],
    motifs: [],
    sort: "newest",
    page,
  };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; fit: string }>;
  searchParams: Promise<FitSearchParams>;
}): Promise<Metadata> {
  const { slug, fit } = await params;
  if (!isIphone18FitSlug(fit) || !isIphone18CollectionSlug(slug)) notFound();
  const [{ page, dirty }, collection] = await Promise.all([
    searchParams.then(cleanFitPage),
    getCollectionBySlug(slug),
  ]);
  if (!collection) notFound();
  const basePath = iphone18FitPath(slug);
  if (dirty) redirect(page > 1 ? `${basePath}?page=${page}` : basePath);
  const copy = iphone18FitCopy(collection.name, slug);
  return catalogPageMetadata({
    title: copy.title,
    description: copy.description,
    params: fitCatalogParams(basePath, page),
    openGraphImage: null,
  });
}

export default async function Iphone18FitPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; fit: string }>;
  searchParams: Promise<FitSearchParams>;
}) {
  const { slug, fit } = await params;
  if (!isIphone18FitSlug(fit) || !isIphone18CollectionSlug(slug)) notFound();

  const basePath = iphone18FitPath(slug);
  const [{ page, dirty }, collection] = await Promise.all([
    searchParams.then(cleanFitPage),
    getCollectionBySlug(slug),
  ]);
  if (!collection) notFound();
  if (dirty) redirect(page > 1 ? `${basePath}?page=${page}` : basePath);

  const catalogParams = fitCatalogParams(basePath, page);
  const [{ items, total, pageSize }, breadcrumb] = await Promise.all([
    getCatalogPage({
      collection: slug,
      device: "iphone",
      page,
      sort: "newest",
    }),
    getCollectionBreadcrumb(collection),
  ]);

  if (total === 0) notFound();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (page > totalPages) {
    redirect(
      totalPages > 1 ? `${basePath}?page=${totalPages}` : basePath,
    );
  }

  const copy = iphone18FitCopy(collection.name, slug as Iphone18CollectionSlug);
  const accent = collection.accentColor ?? "var(--primary)";
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
          collectionPageJsonLd({
            name: copy.heading,
            description: copy.description,
            url: catalogParams.page > 1 ? `${basePath}?page=${catalogParams.page}` : basePath,
            items: items.map((product) => ({
              name: product.title,
              url: `/products/${product.slug}`,
            })),
          }),
          ...(catalogParams.page === 1 ? [faqJsonLd(copy.faqs)] : []),
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
          <span aria-current="page" className="shrink-0 font-semibold text-[var(--foreground)]">
            iPhone 18
          </span>
        </nav>
        <div className="mt-1.5 flex items-baseline justify-between gap-3">
          <h1 className="min-w-0 text-[1.65rem] font-black leading-none tracking-tight sm:text-4xl">
            <span className="sr-only">{copy.heading}</span>
            <span aria-hidden="true" className="block truncate">
              {collection.name}
            </span>
          </h1>
          <p className="shrink-0 text-xs font-semibold tabular-nums text-[var(--foreground)]/50">
            {total} {total === 1 ? "design" : "designs"}
          </p>
        </div>
        <p className="mt-1 text-sm font-medium text-[var(--foreground)]/65">
          Pro & Pro Max
        </p>
      </header>

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

      {catalogParams.page === 1 && (
        <section className="mt-8 max-w-3xl sm:mt-10">
          <h2 className="text-lg font-black">Questions</h2>
          <div className="mt-3 space-y-3">
            {copy.faqs.map((faq) => (
              <article
                key={faq.question}
                className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3.5"
              >
                <h3 className="text-[15px] font-bold leading-snug">{faq.question}</h3>
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

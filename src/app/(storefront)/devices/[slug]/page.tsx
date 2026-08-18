import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import {
  DEVICE_FAMILIES,
  findDevice,
  familyOfDevice,
} from "@/lib/catalog/devices";
import { deviceSeo } from "@/lib/seo/device-content";
import { getProducts } from "@/lib/products";
import { getCollectionTree } from "@/lib/collections";
import { IPHONE_MODELS } from "@/lib/pricing";
import { ProductCard } from "@/components/ProductCard";
import { JsonLd } from "@/components/JsonLd";
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
  parseCatalogParams,
  type CatalogSearchParams,
} from "@/lib/catalog/params";

export const revalidate = 3600;
// Only the live devices below are valid; anything else 404s (no thin pages).
export const dynamicParams = false;

/** Live (stocked) devices get an indexable landing page. */
function liveDeviceIds(): string[] {
  return DEVICE_FAMILIES.flatMap((f) => f.devices)
    .filter((d) => !d.comingSoon)
    .map((d) => d.id);
}

export function generateStaticParams() {
  return liveDeviceIds().map((slug) => ({ slug }));
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
    params: parseCatalogParams(
      await searchParams,
      `/devices/${slug}`,
    ),
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
  const catalogParams = parseCatalogParams(await searchParams, basePath);
  const indexable = isIndexableCatalogPage(catalogParams);
  const canonical = catalogCanonicalHref(catalogParams);
  const seo = deviceSeo(slug, device.label);
  const family = familyOfDevice(slug);
  const page = catalogParams.page;

  const [{ items, total, pageSize }, tree] = await Promise.all([
    getProducts({ device: slug, page, sort: catalogParams.sort }),
    getCollectionTree().catch(() => []),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total > 0 && page > totalPages) {
    redirect(buildCatalogHref(catalogParams, { page: totalPages }));
  }

  // Top character/brand collections for internal linking + crawl depth.
  const topCollections = tree
    .filter((c) => c.totalCount > 0)
    .sort((a, b) => b.totalCount - a.totalCount)
    .slice(0, 12);

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-8 sm:px-6">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", url: "/" },
            { name: "Shop", url: "/products" },
            { name: seo.heading, url: `/devices/${slug}` },
          ]),
          ...(indexable
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
          ...(indexable && page === 1 && seo.faqs.length > 0
            ? [faqJsonLd(seo.faqs)]
            : []),
        ]}
      />

      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="mb-6 flex flex-wrap items-center gap-1 text-sm text-[var(--foreground)]/55"
      >
        <Link href="/" className="hover:text-[var(--primary)]">
          Home
        </Link>
        <ChevronRight aria-hidden className="h-3.5 w-3.5" />
        <Link href="/products" className="hover:text-[var(--primary)]">
          Shop
        </Link>
        <ChevronRight aria-hidden className="h-3.5 w-3.5" />
        <span className="font-semibold text-[var(--foreground)]">
          {seo.heading}
        </span>
      </nav>

      {/* Hero / intro */}
      <header className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-black sm:text-4xl">{seo.heading}</h1>
        <p className="mt-1 text-sm font-semibold text-[var(--foreground)]/50">
          {total} design{total === 1 ? "" : "s"}
          {family ? ` · ${family.label}` : ""}
        </p>
        <p className="mt-4 leading-relaxed text-[var(--foreground)]/75">
          {seo.intro}
        </p>
      </header>

      {/* Shop by character — internal links for discovery + crawl depth */}
      {topCollections.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-black">Shop by character</h2>
          <div className="flex flex-wrap gap-2">
            {topCollections.map((c) => (
              <Link
                key={c.id}
                href={`/collections/${c.slug}`}
                className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-semibold transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
              >
                {c.icon && <span>{c.icon}</span>}
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Products */}
      {items.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                imagePriority={index === 0}
                headingLevel={2}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-10 flex items-center justify-center gap-2">
              {page > 1 && (
                <Link
                  href={buildCatalogHref(catalogParams, { page: page - 1 })}
                  className="rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-semibold hover:border-[var(--primary)]"
                >
                  Previous
                </Link>
              )}
              <span className="px-2 text-sm font-semibold">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <Link
                  href={buildCatalogHref(catalogParams, { page: page + 1 })}
                  className="rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-semibold hover:border-[var(--primary)]"
                >
                  Next
                </Link>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--card)] p-12 text-center">
          <p className="text-4xl">{device.icon}</p>
          <p className="mt-3 text-lg font-bold">Fresh designs coming soon</p>
          <Link
            href="/products"
            className="mt-4 inline-block rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-white"
          >
            Shop all products
          </Link>
        </div>
      )}

      {/* Compatible models (unique content + long-tail relevance) */}
      {slug === "iphone" && (
        <section className="mt-12 max-w-3xl">
          <h2 className="mb-3 text-lg font-black">Compatible iPhone models</h2>
          <p className="text-sm leading-relaxed text-[var(--foreground)]/70">
            {IPHONE_MODELS.join(" · ")}. Select your exact model on any product
            page.
          </p>
        </section>
      )}

      {/* FAQ — visible + structured data */}
      {seo.faqs.length > 0 && (
        <section className="mt-12 max-w-3xl">
          <h2 className="mb-4 text-xl font-black">
            {seo.heading} — FAQ
          </h2>
          <div className="space-y-5">
            {seo.faqs.map((f) => (
              <div key={f.question}>
                <h3 className="font-bold">{f.question}</h3>
                <p className="mt-1 text-[var(--foreground)]/75">{f.answer}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

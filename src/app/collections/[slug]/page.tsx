import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import {
  getCollectionBySlug,
  getCollectionChildren,
  getCollectionBreadcrumb,
} from "@/lib/collections";
import { getProducts } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";

export const revalidate = 3600;

type SearchParams = { page?: string; sort?: "newest" | "price-asc" | "price-desc" };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (!collection) return { title: "Collection not found" };
  return {
    title: collection.name,
    description:
      collection.description ??
      `Shop the ${collection.name} collection at Y2KASE.`,
  };
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const collection = await getCollectionBySlug(slug);
  if (!collection) notFound();

  const page = Number(sp.page ?? "1") || 1;
  const [children, breadcrumb, { items, total, pageSize }] = await Promise.all([
    getCollectionChildren(collection.id),
    getCollectionBreadcrumb(collection),
    getProducts({ collection: slug, page, sort: sp.sort }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const accent = collection.accentColor ?? "var(--primary)";

  function buildHref(overrides: Partial<SearchParams>) {
    const merged = { ...sp, ...overrides };
    const qs = new URLSearchParams();
    if (merged.sort) qs.set("sort", merged.sort);
    if (merged.page && merged.page !== "1") qs.set("page", merged.page);
    const s = qs.toString();
    return s ? `/collections/${slug}?${s}` : `/collections/${slug}`;
  }

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-8 sm:px-6">
      {/* Breadcrumb */}
      <nav className="mb-6 flex flex-wrap items-center gap-1 text-sm text-[var(--foreground)]/55">
        <Link href="/collections" className="hover:text-[var(--primary)]">
          Collections
        </Link>
        {breadcrumb.map((c, i) => (
          <span key={c.id} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5" />
            {i === breadcrumb.length - 1 ? (
              <span className="font-semibold text-[var(--foreground)]">
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
        ))}
      </nav>

      {/* Hero */}
      <header
        className="mb-8 overflow-hidden rounded-3xl border border-[var(--border)] p-8 sm:p-10"
        style={{
          background: `linear-gradient(135deg, ${accent}1f, transparent 70%)`,
        }}
      >
        <div className="flex items-center gap-4">
          {collection.icon && (
            <span
              className="grid h-16 w-16 place-items-center rounded-3xl text-4xl"
              style={{ background: `${accent}33` }}
            >
              {collection.icon}
            </span>
          )}
          <div>
            <h1 className="text-3xl font-black sm:text-4xl">{collection.name}</h1>
            <p className="mt-1 text-sm font-semibold text-[var(--foreground)]/50">
              {total} product{total === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        {collection.description && (
          <p className="mt-4 max-w-2xl text-[var(--foreground)]/70">
            {collection.description}
          </p>
        )}
      </header>

      {/* Sub-collections */}
      {children.length > 0 && (
        <section className="mb-8">
          <div className="flex flex-wrap gap-2">
            {children.map((c) => (
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
            {items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-10 flex items-center justify-center gap-2">
              {page > 1 && (
                <Link
                  href={buildHref({ page: String(page - 1) })}
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
                  href={buildHref({ page: String(page + 1) })}
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
          <p className="text-4xl">{collection.icon ?? "🔍"}</p>
          <p className="mt-3 text-lg font-bold">Nothing here yet</p>
          <p className="mt-1 text-sm text-[var(--foreground)]/60">
            We&apos;re still stocking this collection. Check back soon!
          </p>
          <Link
            href="/products"
            className="mt-4 inline-block rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-white"
          >
            Shop all products
          </Link>
        </div>
      )}
    </div>
  );
}

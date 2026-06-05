import Link from "next/link";
import type { Metadata } from "next";
import { getProducts, getPopularTags } from "@/lib/products";
import { getCollectionBySlug } from "@/lib/collections";
import { deviceLabel, findDevice } from "@/lib/catalog/devices";
import { ProductCard } from "@/components/ProductCard";

export const metadata: Metadata = {
  title: "Shop All",
  description: "Browse all Y2KASE phone cases, charms, and accessories.",
};

type SearchParams = {
  q?: string;
  tag?: string;
  device?: string;
  collection?: string;
  page?: string;
  sort?: "newest" | "price-asc" | "price-desc";
};

/** Merge current params with overrides into a /products URL (undefined drops a key). */
function buildHrefStatic(
  current: SearchParams,
  overrides: Partial<SearchParams>,
) {
  const merged = { ...current, ...overrides };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.tag) params.set("tag", merged.tag);
  if (merged.device) params.set("device", merged.device);
  if (merged.collection) params.set("collection", merged.collection);
  if (merged.sort) params.set("sort", merged.sort);
  if (merged.page && merged.page !== "1") params.set("page", merged.page);
  const qs = params.toString();
  return qs ? `/products?${qs}` : "/products";
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Number(sp.page ?? "1") || 1;

  const [{ items, total, pageSize }, tags, activeCollection] =
    await Promise.all([
      getProducts({
        search: sp.q,
        tag: sp.tag,
        device: sp.device,
        collection: sp.collection,
        page,
        sort: sp.sort,
      }),
      getPopularTags(20),
      sp.collection ? getCollectionBySlug(sp.collection) : Promise.resolve(null),
    ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activeDevice = sp.device ? findDevice(sp.device) : undefined;

  // Active, removable filter chips (everything except free-text search).
  const activeFilters: { label: string; clearHref: string }[] = [];
  if (sp.device)
    activeFilters.push({
      label: deviceLabel(sp.device),
      clearHref: buildHrefStatic(sp, { device: undefined, page: undefined }),
    });
  if (sp.collection)
    activeFilters.push({
      label: activeCollection?.name ?? sp.collection,
      clearHref: buildHrefStatic(sp, { collection: undefined, page: undefined }),
    });
  if (sp.tag)
    activeFilters.push({
      label: sp.tag.replace(/_/g, " "),
      clearHref: buildHrefStatic(sp, { tag: undefined, page: undefined }),
    });

  const heading = activeDevice
    ? `${activeDevice.label} cases`
    : activeCollection
      ? activeCollection.name
      : sp.tag
        ? sp.tag.replace(/_/g, " ")
        : sp.q
          ? `Results for “${sp.q}”`
          : "Shop All";

  function buildHref(overrides: Partial<SearchParams>) {
    return buildHrefStatic(sp, overrides);
  }

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black capitalize">{heading}</h1>
          <p className="mt-1 text-sm text-[var(--foreground)]/60">
            {total} product{total === 1 ? "" : "s"}
          </p>
        </div>

        <form action="/products" className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search cases…"
            className="w-full rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm outline-none focus:border-[var(--primary)] sm:w-56"
          />
          <button type="submit" className="btn-candy px-5 py-2 text-sm">
            Search
          </button>
        </form>
      </div>

      {activeFilters.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/40">
            Filters
          </span>
          {activeFilters.map((f) => (
            <Link
              key={f.label}
              href={f.clearHref}
              className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3 py-1.5 text-sm font-semibold capitalize text-white"
            >
              {f.label}
              <span aria-hidden className="text-white/80">
                ✕
              </span>
            </Link>
          ))}
          <Link
            href="/products"
            className="text-sm font-semibold text-[var(--foreground)]/50 hover:text-[var(--primary)]"
          >
            Clear all
          </Link>
        </div>
      )}

      {tags.length > 0 && (
        <div className="mb-8 flex flex-wrap gap-2">
          <Link
            href="/products"
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
              !sp.tag
                ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]"
            }`}
          >
            All
          </Link>
          {tags.map((tag) => (
            <Link
              key={tag}
              href={`/products?tag=${encodeURIComponent(tag)}`}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold capitalize ${
                sp.tag === tag
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                  : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]"
              }`}
            >
              {tag.replace(/_/g, " ")}
            </Link>
          ))}
        </div>
      )}

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
        <div className="card-cute border-dashed p-12 text-center">
          <p className="text-4xl">🔍</p>
          <p className="mt-3 text-lg font-bold">Nothing here yet</p>
          <p className="mt-1 text-sm text-[var(--foreground)]/60">
            Try a different search or browse all products.
          </p>
        </div>
      )}
    </div>
  );
}

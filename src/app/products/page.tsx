import Link from "next/link";
import type { Metadata } from "next";
import { Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { getProducts, getPopularTags } from "@/lib/products";
import { getCollectionBySlug } from "@/lib/collections";
import { deviceLabel, findDevice } from "@/lib/catalog/devices";
import { ProductCard } from "@/components/ProductCard";
import { SortMenu, type SortValue } from "./SortMenu";

export const metadata: Metadata = {
  title: "Shop All",
  description: "Browse all Y2KASE phone cases, charms, and accessories.",
  // Filtered/paginated variants (?tag, ?page, ?sort, …) all consolidate to the
  // canonical catalog URL so search engines don't index thin duplicates.
  alternates: { canonical: "/products" },
};

type SearchParams = {
  q?: string;
  tag?: string;
  device?: string;
  collection?: string;
  page?: string;
  sort?: SortValue;
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

/**
 * A compact, ellipsised page window (e.g. 1 … 4 5 [6] 7 8 … 20) so pagination
 * stays a single tidy row no matter how deep the catalog runs.
 */
function pageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push("…");
  for (let p = start; p <= end; p++) out.push(p);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
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
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

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
  if (sp.q)
    activeFilters.push({
      label: `“${sp.q}”`,
      clearHref: buildHrefStatic(sp, { q: undefined, page: undefined }),
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

  const eyebrow = activeDevice
    ? "Shop by device"
    : activeCollection
      ? "Collection"
      : sp.tag
        ? "Tagged"
        : sp.q
          ? "Search results"
          : "Browse the shop";

  const subtitle = sp.q
    ? `We found ${total} match${total === 1 ? "" : "es"} for your search.`
    : "Y2K & kawaii cases, charms and accessories — built to protect, made to flex.";

  function buildHref(overrides: Partial<SearchParams>) {
    return buildHrefStatic(sp, overrides);
  }

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-8 sm:px-6">
      {/* ── Branded header ──────────────────────────────────────────────── */}
      <header className="relative mb-6 overflow-hidden rounded-[2rem] border border-[var(--border)] bg-holo px-6 py-8 shadow-[0_18px_45px_-30px_rgba(120,60,120,0.6)] sm:px-9 sm:py-10">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative">
          <p className="font-pixel text-[10px] uppercase tracking-tight text-[var(--primary)]">
            ★ {eyebrow}
          </p>
          <h1 className="mt-2.5 font-display text-3xl font-extrabold capitalize leading-tight text-[var(--foreground)] sm:text-4xl">
            {heading}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--foreground)]/65 sm:text-[15px]">
            {subtitle}
          </p>
        </div>
      </header>

      {/* ── Toolbar: result count · search · sort ───────────────────────── */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--foreground)]/60">
          <SlidersHorizontal className="h-4 w-4 text-[var(--foreground)]/40" />
          {total > 0 ? (
            <>
              Showing{" "}
              <span className="font-extrabold text-[var(--foreground)]">
                {rangeStart}–{rangeEnd}
              </span>{" "}
              of{" "}
              <span className="font-extrabold text-[var(--foreground)]">
                {total}
              </span>{" "}
              product{total === 1 ? "" : "s"}
            </>
          ) : (
            "No products"
          )}
        </p>

        <div className="flex items-center gap-2">
          <form action="/products" className="relative flex-1 sm:flex-none">
            {/* Preserve the active facet filters when running a new text search. */}
            {sp.tag && <input type="hidden" name="tag" value={sp.tag} />}
            {sp.device && <input type="hidden" name="device" value={sp.device} />}
            {sp.collection && (
              <input type="hidden" name="collection" value={sp.collection} />
            )}
            {sp.sort && <input type="hidden" name="sort" value={sp.sort} />}
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--foreground)]/40" />
            <input
              type="search"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Search cases…"
              className="w-full rounded-full border border-[var(--border)] bg-[var(--card)] py-2.5 pl-10 pr-4 text-sm shadow-sm outline-none transition focus:border-[var(--primary)] sm:w-64"
            />
          </form>
          <SortMenu
            value={sp.sort ?? "newest"}
            params={{
              q: sp.q,
              tag: sp.tag,
              device: sp.device,
              collection: sp.collection,
            }}
          />
        </div>
      </div>

      {/* ── Active filter chips ─────────────────────────────────────────── */}
      {activeFilters.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/40">
            Filters
          </span>
          {activeFilters.map((f) => (
            <Link
              key={f.label}
              href={f.clearHref}
              className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3 py-1.5 text-sm font-semibold capitalize text-white shadow-[0_3px_0_#d62f88] transition hover:brightness-105"
            >
              {f.label}
              <X aria-hidden className="h-3.5 w-3.5 text-white/80" />
            </Link>
          ))}
          <Link
            href="/products"
            className="text-sm font-semibold text-[var(--foreground)]/50 transition hover:text-[var(--primary)]"
          >
            Clear all
          </Link>
        </div>
      )}

      {/* ── Popular tags ────────────────────────────────────────────────── */}
      {tags.length > 0 && (
        <div className="mb-8 flex items-center gap-2">
          <span className="hidden shrink-0 items-center gap-1 text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/40 sm:flex">
            <Sparkles className="h-3.5 w-3.5" /> Popular
          </span>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
            <Link
              href="/products"
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
                !sp.tag
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white shadow-[0_3px_0_#d62f88]"
                  : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]"
              }`}
            >
              All
            </Link>
            {tags.map((tag) => (
              <Link
                key={tag}
                href={buildHref({ tag, page: undefined })}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold capitalize transition ${
                  sp.tag === tag
                    ? "border-[var(--primary)] bg-[var(--primary)] text-white shadow-[0_3px_0_#d62f88]"
                    : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]"
                }`}
              >
                {tag.replace(/_/g, " ")}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Product grid ────────────────────────────────────────────────── */}
      {items.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          {totalPages > 1 && (
            <nav
              aria-label="Pagination"
              className="mt-12 flex items-center justify-center gap-1.5"
            >
              <Link
                href={buildHref({ page: String(page - 1) })}
                aria-disabled={page <= 1}
                className={`grid h-10 min-w-10 place-items-center rounded-full border px-3 text-sm font-bold transition ${
                  page <= 1
                    ? "pointer-events-none border-[var(--border)] text-[var(--foreground)]/30"
                    : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                }`}
              >
                Prev
              </Link>

              {pageWindow(page, totalPages).map((p, i) =>
                p === "…" ? (
                  <span
                    key={`gap-${i}`}
                    className="grid h-10 w-8 place-items-center text-sm text-[var(--foreground)]/40"
                  >
                    …
                  </span>
                ) : (
                  <Link
                    key={p}
                    href={buildHref({ page: String(p) })}
                    aria-current={p === page ? "page" : undefined}
                    className={`grid h-10 w-10 place-items-center rounded-full text-sm font-bold transition ${
                      p === page
                        ? "bg-[var(--primary)] text-white shadow-[0_3px_0_#d62f88]"
                        : "border border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                    }`}
                  >
                    {p}
                  </Link>
                ),
              )}

              <Link
                href={buildHref({ page: String(page + 1) })}
                aria-disabled={page >= totalPages}
                className={`grid h-10 min-w-10 place-items-center rounded-full border px-3 text-sm font-bold transition ${
                  page >= totalPages
                    ? "pointer-events-none border-[var(--border)] text-[var(--foreground)]/30"
                    : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                }`}
              >
                Next
              </Link>
            </nav>
          )}
        </>
      ) : (
        <div className="card-cute border-dashed px-6 py-16 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-holo text-3xl">
            🔍
          </div>
          <p className="mt-4 text-lg font-extrabold">No matches found</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--foreground)]/60">
            We couldn’t find anything for these filters. Try a different search
            or browse the full collection.
          </p>
          <Link
            href="/products"
            className="btn-candy mt-6 inline-flex px-6 py-2.5 text-sm"
          >
            Browse all products
          </Link>
        </div>
      )}
    </div>
  );
}

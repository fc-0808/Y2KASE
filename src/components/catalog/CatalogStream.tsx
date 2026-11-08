"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { loadCatalogSlice } from "@/app/(storefront)/catalog-actions";
import { ProductCard, PRODUCT_CARD_FRAME, PRODUCT_MOSAIC } from "@/components/ProductCard";
import type { ProductListItem, ProductQuery } from "@/lib/products";
import type { CatalogParams } from "@/lib/catalog/params";
import { CatalogPagination } from "./CatalogPagination";
import { CatalogSummary, type CatalogChip } from "./CatalogSummary";

type Shelf = {
  id: "bestsellers" | "new";
  eyebrow: string;
  title: string;
  items: ProductListItem[];
};

/**
 * Featured order is already bestsellers, then newest. Split that run into
 * shelves. A price sort stays one grid — regrouping it would undo the sort.
 */
function shelvesOf(products: ProductListItem[], shelved: boolean): Shelf[] | null {
  if (!shelved) return null;
  const best: ProductListItem[] = [];
  const rest: ProductListItem[] = [];
  for (const product of products) {
    if (rest.length === 0 && product.featured) best.push(product);
    else rest.push(product);
  }
  const shelves: Shelf[] = [];
  if (best.length > 0) {
    shelves.push({
      id: "bestsellers",
      eyebrow: "Most loved",
      title: "Bestsellers",
      items: best,
    });
  }
  if (rest.length > 0) {
    shelves.push({
      id: "new",
      eyebrow: "Just in",
      title: "New arrivals",
      items: rest,
    });
  }
  return shelves.length > 0 ? shelves : null;
}

/**
 * The catalog grid, continued.
 *
 * The first window is the server render (same 24 cards, same query). As the
 * end of that window nears the viewport, the next window is appended. Cards
 * past the first screen use `content-visibility`, so a long scroll does not
 * lay out or decode photos that are still off screen. Numbered pages stay in
 * the document for crawlers and for jumping ahead.
 */
export function CatalogStream({
  items,
  total,
  page,
  pageSize,
  query,
  params,
  chips,
  resetHref,
  showDeviceBadge = true,
  headingLevel = 2,
}: {
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  query: ProductQuery;
  params: CatalogParams;
  chips: CatalogChip[];
  resetHref?: string;
  showDeviceBadge?: boolean;
  headingLevel?: 2 | 3;
}) {
  const [more, setMore] = useState<ProductListItem[]>([]);
  const [nextPage, setNextPage] = useState(page + 1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const busy = useRef(false);
  const alive = useRef(true);
  const sentinel = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set(items.map((item) => item.id)));

  const shown = items.length + more.length;
  const covered = (page - 1) * pageSize + shown;
  const done = exhausted || covered >= total;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(covered, total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (busy.current || done) return;
    busy.current = true;
    setLoading(true);
    setFailed(false);
    const pageToLoad = nextPage;
    try {
      const slice = await loadCatalogSlice({ ...query, page: pageToLoad });
      if (!alive.current) return;
      const fresh = slice.items.filter((item) => {
        if (seen.current.has(item.id)) return false;
        seen.current.add(item.id);
        return true;
      });
      if (fresh.length === 0) {
        setExhausted(true);
      } else {
        setMore((current) => current.concat(fresh));
        setNextPage(pageToLoad + 1);
      }
    } catch {
      if (alive.current) setFailed(true);
    } finally {
      busy.current = false;
      if (alive.current) setLoading(false);
    }
  }, [done, nextPage, query]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || done || failed) return;

    let observer: IntersectionObserver | null = null;
    let idleId = 0;
    let timerId = 0;
    let cancelled = false;

    const start = () => {
      const target = sentinel.current;
      if (cancelled || !target) return;
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) void loadMore();
        },
        // One screen ahead. The next window is ready before the fold ends,
        // without starting that read during the first paint.
        { rootMargin: "640px 0px" },
      );
      observer.observe(target);
    };

    // Wait until the document has loaded, then until the browser is idle, so
    // page 2 does not compete with the first product photo.
    const arm = () => {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(start, { timeout: 1000 });
      } else {
        timerId = window.setTimeout(start, 250);
      }
    };

    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", arm);
      if (idleId) window.cancelIdleCallback(idleId);
      if (timerId) window.clearTimeout(timerId);
      observer?.disconnect();
    };
  }, [done, failed, loadMore]);

  const products = more.length === 0 ? items : items.concat(more);
  const shelves = shelvesOf(products, params.sort === "newest");
  const cardLevel = shelves ? 3 : headingLevel;

  return (
    <>
      <CatalogSummary
        total={total}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        chips={chips}
        resetHref={resetHref}
      />

      {shelves ? (
        <div aria-busy={loading}>
          {shelves.map((shelf, shelfIndex) => {
            const start = shelves
              .slice(0, shelfIndex)
              .reduce((sum, entry) => sum + entry.items.length, 0);
            return (
              <section
                key={shelf.id}
                aria-labelledby={`catalog-shelf-${shelf.id}`}
                className={shelfIndex === 0 ? "mt-1" : "mt-10 sm:mt-12"}
              >
                <header className="mb-2 sm:mb-3">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--primary)]">
                    {shelf.eyebrow}
                  </p>
                  <h2
                    id={`catalog-shelf-${shelf.id}`}
                    className="text-base font-black leading-none tracking-tight sm:mt-1 sm:text-xl"
                  >
                    {shelf.title}
                  </h2>
                </header>
                <div className={PRODUCT_MOSAIC}>
                  {shelf.items.map((product, index) => (
                    <CatalogCard
                      key={product.id}
                      product={product}
                      index={start + index}
                      headingLevel={cardLevel}
                      showDeviceBadge={showDeviceBadge}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          {loading && <CatalogSkeletons />}
        </div>
      ) : (
        <div className={PRODUCT_MOSAIC} aria-busy={loading}>
          {products.map((product, index) => (
            <CatalogCard
              key={product.id}
              product={product}
              index={index}
              headingLevel={cardLevel}
              showDeviceBadge={showDeviceBadge}
            />
          ))}
          {loading && <CatalogSkeletons bare />}
        </div>
      )}

      {!done && (
        <div ref={sentinel} className="h-px" aria-hidden />
      )}

      {loading && (
        <p className="sr-only" role="status">
          Loading more products
        </p>
      )}

      {failed && !done && (
        <button
          type="button"
          onClick={() => void loadMore()}
          className="mx-auto mt-8 flex h-11 items-center rounded-full border border-[var(--border)] bg-[var(--card)] px-5 text-sm font-bold shadow-sm transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
        >
          Show more
        </button>
      )}

      <CatalogPagination params={params} totalPages={totalPages} />
    </>
  );
}

const CatalogCard = memo(function CatalogCard({
  product,
  index,
  headingLevel,
  showDeviceBadge,
}: {
  product: ProductListItem;
  index: number;
  headingLevel: 2 | 3;
  showDeviceBadge: boolean;
}) {
  return (
    <div className={index >= 4 ? "cv-card h-full min-w-0" : "h-full min-w-0"}>
      <ProductCard
        product={product}
        imagePriority={index === 0}
        headingLevel={headingLevel}
        showDeviceBadge={showDeviceBadge}
      />
    </div>
  );
});

function CatalogSkeletons({ bare = false }: { bare?: boolean }) {
  const cells = Array.from({ length: 4 }, (_, index) => (
    <div key={`more-${index}`} className="animate-pulse" aria-hidden>
      <div className={`${PRODUCT_CARD_FRAME} rounded-3xl bg-[var(--muted)]`} />
      <div className="mt-2 h-4 w-3/4 rounded bg-[var(--muted)]" />
      <div className="mt-2 h-4 w-1/3 rounded bg-[var(--muted)]" />
    </div>
  ));
  if (bare) return cells;
  return <div className={`${PRODUCT_MOSAIC} mt-3`}>{cells}</div>;
}

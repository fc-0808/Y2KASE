import { PRODUCT_CARD_FRAME, PRODUCT_MOSAIC } from "@/components/ProductCard";

/**
 * Shared browse-chrome skeleton — sticky mobile bar (search + sort) and the
 * desktop search row — so /products, collection and device
 * loadings paint the same shape the live toolbar now has.
 */
export function CatalogChromeSkeleton({ flushTop = false }: { flushTop?: boolean }) {
  return (
    <div
      className={`sticky top-[var(--storefront-header-h)] z-30 -mx-4 bg-background px-4 sm:-mx-6 sm:px-6 ${flushTop ? "-mt-4 pt-2 sm:-mt-6 sm:pt-2" : ""}`}
    >
      <div className="flex items-center gap-3 lg:hidden">
        <div className="h-11 min-w-0 flex-1 animate-pulse rounded-full bg-[var(--muted)]" />
        <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-[var(--muted)]" />
      </div>
      <div className="hidden lg:flex lg:items-center lg:gap-3">
        <div className="h-10 w-full max-w-md animate-pulse rounded-full bg-[var(--muted)]" />
        <div className="h-10 w-36 shrink-0 animate-pulse rounded-full bg-[var(--muted)]" />
      </div>
    </div>
  );
}

/**
 * `/products` listing pending UI. Used from the `(listing)` route group so it
 * never wraps `/products/[slug]` — a parent `loading.tsx` would flush HTTP 200
 * before `notFound()` and turn missing PDPs into soft-404 HTML.
 */
export function ProductsListingSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-4 sm:px-6 sm:py-6">
      <CatalogChromeSkeleton flushTop />
      <LookRailSkeleton />
      <div className="mb-3 mt-3 h-5 w-40 animate-pulse rounded-full bg-[var(--muted)] sm:mb-4 sm:mt-4" />
      <CatalogGridSkeleton />
    </div>
  );
}

/**
 * Collection / device landing pending UI. Rendered from an in-page Suspense
 * boundary *after* the slug has been resolved, so missing landings can still
 * return a real 404 instead of a streamed 200 skeleton.
 */
export function CatalogIdentityLandingSkeleton({
  showDescription = false,
}: {
  showDescription?: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-3 rounded-2xl border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-3 sm:mb-4 sm:rounded-3xl sm:px-6 sm:py-4">
        <div className="h-4 w-40 animate-pulse rounded-full bg-[var(--muted)]" />
        <div className="mt-2 h-7 w-56 animate-pulse rounded-full bg-[var(--muted)] sm:h-8" />
        {showDescription ? (
          <div className="mt-2 h-4 w-72 max-w-full animate-pulse rounded-full bg-[var(--muted)]" />
        ) : null}
      </div>
      <CatalogChromeSkeleton />
      <LookRailSkeleton />
      <div className="mb-3 mt-3 h-5 w-40 animate-pulse rounded-full bg-[var(--muted)] sm:mb-4 sm:mt-4" />
      <CatalogGridSkeleton />
    </div>
  );
}

function LookRailSkeleton() {
  return (
    <div className="mt-2" aria-hidden>
      <div className="flex h-8 items-end gap-3">
        <div className="mb-2 h-3 w-16 animate-pulse rounded-full bg-[var(--muted)]" />
        <div className="mb-2 h-3 w-12 animate-pulse rounded-full bg-[var(--muted)]" />
        <div className="mb-2 h-3 w-10 animate-pulse rounded-full bg-[var(--muted)]" />
      </div>
      <div className="mt-2 flex gap-2 overflow-hidden lg:gap-3">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="w-20 shrink-0 lg:w-[6.75rem]">
            <div className="aspect-video animate-pulse rounded-xl bg-[var(--muted)]" />
            <div className="mx-auto mt-1.5 h-2.5 w-12 animate-pulse rounded-full bg-[var(--muted)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CatalogGridSkeleton({ count = 15 }: { count?: number }) {
  return (
    <div className={PRODUCT_MOSAIC}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden bg-transparent"
        >
          <div className={`${PRODUCT_CARD_FRAME} animate-pulse bg-[var(--muted)]`} />
          <div className="flex flex-col gap-2 pt-2 md:pt-2.5">
            <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--muted)]" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-[var(--muted)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

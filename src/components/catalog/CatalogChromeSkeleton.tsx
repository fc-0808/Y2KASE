import { PRODUCT_CARD_FRAME, PRODUCT_MOSAIC } from "@/components/ProductCard";

/**
 * Shared browse-chrome skeleton — sticky mobile refine bar (search + Filter /
 * Sort) and the desktop pill row — so /products, collection and device
 * loadings paint the same shape the live toolbar now has.
 */
export function CatalogChromeSkeleton() {
  return (
    <div className="sticky top-[var(--storefront-header-h)] z-30 -mx-4 border-b border-[var(--border)] bg-[var(--background)]/90 px-4 py-2.5 sm:-mx-6 sm:px-6 lg:static lg:z-auto lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
      <div className="flex flex-col gap-2 lg:hidden">
        <div className="h-11 w-full animate-pulse rounded-full bg-[var(--muted)]" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-11 animate-pulse rounded-full bg-[var(--muted)]" />
          <div className="h-11 animate-pulse rounded-full bg-[var(--muted)]" />
        </div>
      </div>
      <div className="hidden lg:flex lg:items-center lg:justify-between lg:gap-3">
        <div className="flex gap-2">
          <div className="h-10 w-36 animate-pulse rounded-full bg-[var(--muted)]" />
          <div className="h-10 w-28 animate-pulse rounded-full bg-[var(--muted)]" />
          <div className="h-10 w-24 animate-pulse rounded-full bg-[var(--muted)]" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-64 animate-pulse rounded-full bg-[var(--muted)]" />
          <div className="h-10 w-36 animate-pulse rounded-full bg-[var(--muted)]" />
        </div>
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
    <div className="mx-auto w-full max-w-[1800px] px-4 py-3 sm:px-6 sm:py-7">
      <CatalogChromeSkeleton />
      <div className="mb-4 mt-3 h-5 w-40 animate-pulse rounded-full bg-[var(--muted)] sm:mb-6 sm:mt-4" />
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
      <div className="mb-4 mt-3 h-5 w-40 animate-pulse rounded-full bg-[var(--muted)] sm:mb-6 sm:mt-4" />
      <CatalogGridSkeleton />
    </div>
  );
}

export function CatalogGridSkeleton({ count = 15 }: { count?: number }) {
  return (
    <div className={PRODUCT_MOSAIC}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] md:rounded-3xl"
        >
          <div className={`${PRODUCT_CARD_FRAME} animate-pulse bg-[var(--muted)]`} />
          <div className="flex flex-col gap-2 p-2.5 md:p-4">
            <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--muted)]" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-[var(--muted)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Device landing skeleton. Mirrors the real page's shape — identity band →
 * toolbar → result summary → grid — so a filter, sort or search navigation
 * paints structure immediately instead of a blank main, and the layout doesn't
 * jump when the query returns. Same contract as `/products/loading` and
 * `/collections/[slug]/loading`, because it is now the same catalog underneath.
 */

import {
  CatalogChromeSkeleton,
  CatalogGridSkeleton,
} from "@/components/catalog/CatalogChromeSkeleton";

export default function DeviceLoading() {
  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-3 rounded-2xl border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-3 sm:mb-4 sm:rounded-3xl sm:px-6 sm:py-4">
        <div className="h-4 w-40 animate-pulse rounded-full bg-[var(--muted)]" />
        <div className="mt-2 h-7 w-56 animate-pulse rounded-full bg-[var(--muted)] sm:h-8" />
        <div className="mt-2 h-4 w-72 max-w-full animate-pulse rounded-full bg-[var(--muted)]" />
      </div>
      <CatalogChromeSkeleton />
      <div className="mb-4 mt-3 h-5 w-40 animate-pulse rounded-full bg-[var(--muted)] sm:mb-6 sm:mt-4" />
      <CatalogGridSkeleton />
    </div>
  );
}

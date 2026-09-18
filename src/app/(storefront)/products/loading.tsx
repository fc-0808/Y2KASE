/**
 * Products listing skeleton. Shown instantly while the server query runs, so a
 * filter/sort/search navigation feels immediate instead of blank — a real
 * perceived-performance win on the most-trafficked browse route. Its shape
 * mirrors the real page (toolbar → result summary → grid) so the layout doesn't
 * jump when content arrives.
 */

import {
  CatalogChromeSkeleton,
  CatalogGridSkeleton,
} from "@/components/catalog/CatalogChromeSkeleton";

export default function ProductsLoading() {
  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-3 sm:px-6 sm:py-7">
      <CatalogChromeSkeleton />
      <div className="mb-4 mt-3 h-5 w-40 animate-pulse rounded-full bg-[var(--muted)] sm:mb-6 sm:mt-4" />
      <CatalogGridSkeleton />
    </div>
  );
}

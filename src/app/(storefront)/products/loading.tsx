/**
 * Products listing skeleton. Shown instantly while the server query runs, so a
 * filter/sort/search navigation feels immediate instead of blank — a real
 * perceived-performance win on the most-trafficked browse route. Its shape
 * mirrors the real page (toolbar → result summary → grid) so the layout doesn't
 * jump when content arrives.
 */
export default function ProductsLoading() {
  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-6 sm:py-7">
      {/* Toolbar: facet triggers · search · sort */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-2">
          <div className="h-10 w-36 animate-pulse rounded-full bg-[var(--muted)]" />
          <div className="h-10 w-28 animate-pulse rounded-full bg-[var(--muted)]" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-full animate-pulse rounded-full bg-[var(--muted)] lg:w-64" />
          <div className="h-10 w-32 animate-pulse rounded-full bg-[var(--muted)]" />
        </div>
      </div>

      {/* Result summary */}
      <div className="mb-5 mt-3 h-5 w-40 animate-pulse rounded-full bg-[var(--muted)] sm:mb-6 sm:mt-4" />

      {/* Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 15 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)]"
          >
            <div className="aspect-[2/3] animate-pulse bg-[var(--muted)] md:aspect-[4/5]" />
            <div className="flex flex-col gap-2 p-4">
              <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--muted)]" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-[var(--muted)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

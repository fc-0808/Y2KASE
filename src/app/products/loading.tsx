/**
 * Products listing skeleton. Shown instantly while the server query runs, so a
 * filter/sort/search navigation feels immediate instead of blank — a real
 * perceived-performance win on the most-trafficked browse route.
 */
export default function ProductsLoading() {
  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-8 sm:px-6">
      <div className="mb-6 h-9 w-48 animate-pulse rounded-full bg-[var(--muted)]" />
      <div className="mb-8 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-9 w-24 animate-pulse rounded-full bg-[var(--muted)]"
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 15 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)]"
          >
            <div className="aspect-square animate-pulse bg-[var(--muted)]" />
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

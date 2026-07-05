/**
 * Products listing skeleton. Shown instantly while the server query runs, so a
 * filter/sort/search navigation feels immediate instead of blank — a real
 * perceived-performance win on the most-trafficked browse route. Its shape
 * mirrors the real page (header band → toolbar → tags → grid) so the layout
 * doesn't jump when content arrives.
 */
export default function ProductsLoading() {
  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-8 sm:px-6">
      {/* Header band */}
      <div className="relative mb-6 overflow-hidden rounded-[2rem] border border-[var(--border)] bg-holo px-6 py-8 sm:px-9 sm:py-10">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative space-y-3">
          <div className="h-3 w-28 animate-pulse rounded-full bg-white/50" />
          <div className="h-9 w-56 animate-pulse rounded-2xl bg-white/60" />
          <div className="h-4 w-72 max-w-full animate-pulse rounded-full bg-white/40" />
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-5 w-40 animate-pulse rounded-full bg-[var(--muted)]" />
        <div className="flex gap-2">
          <div className="h-10 w-full animate-pulse rounded-full bg-[var(--muted)] sm:w-64" />
          <div className="h-10 w-32 animate-pulse rounded-full bg-[var(--muted)]" />
        </div>
      </div>

      {/* Tags */}
      <div className="mb-8 flex gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-9 w-24 animate-pulse rounded-full bg-[var(--muted)]"
          />
        ))}
      </div>

      {/* Grid */}
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

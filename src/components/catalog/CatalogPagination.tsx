/**
 * CatalogPagination — a compact, ellipsised page window (1 … 4 5 [6] 7 8 … 20)
 * so pagination stays a single tidy row no matter how deep the catalog runs.
 *
 * Every entry is a real <Link> on this surface's own `basePath`, so pages are
 * crawlable, middle-clickable and preserve whatever facets are active.
 */

import Link from "next/link";
import { buildCatalogHref, type CatalogParams } from "@/lib/catalog/params";

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

const STEP_BASE =
  "grid h-10 min-w-10 place-items-center rounded-full border px-3 text-sm font-bold transition";

export function CatalogPagination({
  params,
  totalPages,
}: {
  params: CatalogParams;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Pagination"
      className="mt-12 flex items-center justify-center gap-1.5"
    >
      <Link
        href={buildCatalogHref(params, { page: params.page - 1 })}
        aria-disabled={params.page <= 1}
        className={`${STEP_BASE} ${
          params.page <= 1
            ? "pointer-events-none border-[var(--border)] text-[var(--foreground)]/30"
            : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
        }`}
      >
        Prev
      </Link>

      {pageWindow(params.page, totalPages).map((p, i) =>
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
            href={buildCatalogHref(params, { page: p })}
            aria-current={p === params.page ? "page" : undefined}
            className={`grid h-10 w-10 place-items-center rounded-full text-sm font-bold transition ${
              p === params.page
                ? "bg-[var(--primary)] text-white shadow-[0_3px_0_#d62f88]"
                : "border border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
            }`}
          >
            {p}
          </Link>
        ),
      )}

      <Link
        href={buildCatalogHref(params, { page: params.page + 1 })}
        aria-disabled={params.page >= totalPages}
        className={`${STEP_BASE} ${
          params.page >= totalPages
            ? "pointer-events-none border-[var(--border)] text-[var(--foreground)]/30"
            : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
        }`}
      >
        Next
      </Link>
    </nav>
  );
}

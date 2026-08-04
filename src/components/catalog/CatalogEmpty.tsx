/**
 * CatalogEmpty — the zero-results state.
 *
 * An empty grid has two entirely different causes and they need two different
 * exits. "Your filters match nothing" is recoverable in one click and the
 * button must undo the filters; "we don't stock this yet" is not the shopper's
 * doing and the only useful button leads somewhere that does have stock.
 * Showing the wrong one strands people — a "Clear filters" button on a
 * collection nobody has stocked does nothing at all when pressed.
 */

import Link from "next/link";
import { CATALOG_PATH } from "@/lib/catalog/params";

export function CatalogEmpty({
  filtered,
  resetHref,
  icon = "🔍",
}: {
  /** True when the shopper narrowed their way here. */
  filtered: boolean;
  /** This surface, unfiltered. */
  resetHref: string;
  icon?: string;
}) {
  return (
    <div className="card-cute border-dashed px-6 py-16 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-holo text-3xl">
        {icon}
      </div>
      <p className="mt-4 text-lg font-extrabold">
        {filtered ? "No matches found" : "Nothing here yet"}
      </p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--foreground)]/60">
        {filtered
          ? "We couldn’t find anything for these filters. Try a different search or clear them to see everything here."
          : "We’re still stocking this one. Check back soon!"}
      </p>
      <Link
        href={filtered ? resetHref : CATALOG_PATH}
        className="btn-candy mt-6 inline-flex px-6 py-2.5 text-sm"
      >
        {filtered ? "Clear filters" : "Browse all products"}
      </Link>
    </div>
  );
}

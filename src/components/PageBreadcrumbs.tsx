import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Crumb } from "@/lib/seo";

/**
 * Visible trail for static public pages. JSON-LD BreadcrumbList is emitted
 * separately so this component can stay a presentational list.
 */
export function PageBreadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  if (crumbs.length < 2) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-6 flex min-w-0 flex-wrap items-center gap-1 text-sm text-[var(--foreground)]/60"
    >
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1;
        return (
          <span key={`${crumb.url}:${crumb.name}`} className="flex min-w-0 items-center gap-1">
            {index > 0 && (
              <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0" />
            )}
            {last ? (
              <span
                aria-current="page"
                className="truncate font-semibold text-[var(--foreground)]"
              >
                {crumb.name}
              </span>
            ) : (
              <Link
                href={crumb.url}
                className="shrink-0 hover:text-[var(--primary)]"
              >
                {crumb.name}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

import Link from "next/link";
import type { CollectionEditorial } from "@/lib/seo/collection-editorial";

/**
 * Unique collection body + indexable related links. Lives below the grid so
 * it does not compete with filters, but still sits in the first-party HTML.
 */
export function CollectionEditorialBlock({
  editorial,
}: {
  editorial: CollectionEditorial;
}) {
  if (editorial.paragraphs.length === 0 && editorial.related.length === 0) {
    return null;
  }

  return (
    <section className="mt-12 max-w-3xl border-t border-[var(--border)] pt-6">
      {editorial.paragraphs.map((paragraph, index) => (
        <p
          key={index}
          className="mt-3 text-sm leading-relaxed text-[var(--foreground)]/70 first:mt-0 sm:text-base"
        >
          {paragraph}
        </p>
      ))}
      {editorial.related.length > 0 && (
        <nav
          aria-label="Related collections and guides"
          className="mt-5 flex flex-wrap gap-2"
        >
          {editorial.related.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3.5 py-1.5 text-sm font-semibold shadow-sm transition hover:border-[var(--primary)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </section>
  );
}

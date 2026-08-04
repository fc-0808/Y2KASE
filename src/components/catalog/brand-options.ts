/**
 * Shared brand-facet option shape and name lookup.
 *
 * Lives outside any `"use client"` module so server pages (chips, headings)
 * and the client filter menu can both resolve a slug — including nested
 * character children — without crossing the server/client boundary.
 */

export type BrandOption = {
  slug: string;
  name: string;
  icon: string | null;
  accentColor: string | null;
  /** Stocked character children — nested under the brand on `/products`. */
  children?: BrandOption[];
};

/** Resolve a selected slug to a display name, searching nested children too. */
export function brandOptionName(
  brands: BrandOption[],
  slug: string,
): string | undefined {
  for (const brand of brands) {
    if (brand.slug === slug) return brand.name;
    const child = brand.children?.find((c) => c.slug === slug);
    if (child) return child.name;
  }
  return undefined;
}

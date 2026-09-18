/**
 * Sort for the /collections directory (brand cards + more-brands pills).
 *
 * Distinct from catalog product sort: this page is a merchandised index, not a
 * PLP. `featured` is the taxonomy order the merch team already ranked; the
 * other two let a shopper scan by size or by name without leaving the page.
 */

export const DIRECTORY_SORTS = ["featured", "count", "name"] as const;
export type DirectorySort = (typeof DIRECTORY_SORTS)[number];

export const DEFAULT_DIRECTORY_SORT: DirectorySort = "featured";

export const DIRECTORY_SORT_LABELS: Record<DirectorySort, string> = {
  featured: "Featured",
  count: "Most products",
  name: "A to Z",
};

/** Compact labels for the mobile Sort trigger — same role as `SORT_TRIGGER_LABELS`. */
export const DIRECTORY_SORT_TRIGGER_LABELS: Record<DirectorySort, string> = {
  featured: "Featured",
  count: "Most products",
  name: "A to Z",
};

export function isDirectorySort(value: string | undefined): value is DirectorySort {
  return DIRECTORY_SORTS.includes(value as DirectorySort);
}

export function parseDirectorySort(
  value: string | string[] | undefined,
): DirectorySort {
  const raw = Array.isArray(value) ? value[0] : value;
  return isDirectorySort(raw) ? raw : DEFAULT_DIRECTORY_SORT;
}

export function collectionsIndexHref(sort: DirectorySort): string {
  if (sort === DEFAULT_DIRECTORY_SORT) return "/collections";
  return `/collections?sort=${sort}`;
}

export function sortDirectoryBrands<T extends { name: string; totalCount: number }>(
  brands: T[],
  sort: DirectorySort,
): T[] {
  if (sort === "featured") return brands;
  const copy = [...brands];
  if (sort === "count") {
    copy.sort(
      (a, b) => b.totalCount - a.totalCount || a.name.localeCompare(b.name),
    );
  } else {
    copy.sort((a, b) => a.name.localeCompare(b.name));
  }
  return copy;
}

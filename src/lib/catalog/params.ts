/**
 * Catalog URL state — the one place that knows how a browse surface encodes its
 * filters into a query string, and the only place allowed to decode them.
 *
 * The URL *is* the catalog's state: every facet is shareable, bookmarkable,
 * back-button-safe and server-rendered. That only holds if the page, the sort
 * control, the filter dropdowns and the search form all agree byte-for-byte on
 * how that string is written — they used to each build it by hand, which is how
 * a search could quietly drop the active MagSafe facet.
 *
 * ── More than one catalog ───────────────────────────────────────────────────
 * `/products` is not the only faceted grid on the storefront: every collection
 * landing page is the same catalog scoped to one branch of the taxonomy. They
 * differ in exactly one respect — the route they write their state back to —
 * so {@link CatalogParams} carries its own `basePath` and every href is built
 * from it. Threading the path through each call instead would have made
 * "forgot to pass it" a silent bug that routes a shopper out of the collection
 * they were browsing; carrying it in the state makes that unrepresentable.
 *
 * Both halves live here and are shared by server and client components alike
 * (this module is pure: no `use client`, no data access, no React).
 */

import { COLOR_FAMILY_SLUGS, isColorFamilySlug } from "./colors";
import { MOTIF_FAMILY_SLUGS, isMotifFamilySlug } from "./motifs";

/** Canonical path of the unscoped catalog. */
export const CATALOG_PATH = "/products";

export const SORT_VALUES = ["newest", "price-asc", "price-desc"] as const;
export type SortValue = (typeof SORT_VALUES)[number];
export const DEFAULT_SORT: SortValue = "newest";

/** Upper bound on selected brands, so a hand-edited URL can't fan out the query. */
const MAX_BRANDS = 24;
/** Upper bound on selected color families — the closed vocabulary is 16. */
const MAX_COLORS = 16;
/** Upper bound on selected motif families — the closed vocabulary is 14. */
const MAX_MOTIFS = 14;
/** Bound cache cardinality and the amount of text sent through `ILIKE`. */
const MAX_SEARCH_LENGTH = 120;
/** Prevent arbitrary offsets from turning a hand-edited URL into an expensive scan. */
const MAX_PAGE = 1_000;

/** Collection slugs are lowercase kebab-case; anything else is not a real facet. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Legacy product tags also use underscores (for example `phone_charm`). */
const TAG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/**
 * The raw, untrusted shape Next hands us. Repeatable params (`?brand=a&brand=b`)
 * arrive as arrays, single ones as strings — {@link parseCatalogParams} is what
 * flattens that away so no consumer has to think about it.
 */
export type CatalogSearchParams = {
  q?: string | string[];
  tag?: string | string[];
  device?: string | string[];
  collection?: string | string[];
  brand?: string | string[];
  color?: string | string[];
  motif?: string | string[];
  magsafe?: string | string[];
  page?: string | string[];
  sort?: string | string[];
};

/** Parsed, validated, fully normalised catalog state. */
export type CatalogParams = {
  /**
   * Route this state belongs to — `/products`, or a collection landing page.
   * Never serialised into the query string; it *is* the path every href is
   * written against.
   */
  basePath: string;
  /** Free-text search over title + description. */
  q?: string;
  /** Single product tag, e.g. `phone_charm`. Kept for deep links (PDP, footer, blog). */
  tag?: string;
  /** Device taxonomy id, e.g. `iphone`. */
  device?: string;
  /**
   * Collection slug — the browse context a shopper arrived from. Only ever set
   * on `/products`; a collection landing page carries the same narrowing in its
   * route, and duplicating it here would render a filter chip that clears to
   * the page it is already on.
   */
  collection?: string;
  /**
   * Selected facet slugs, OR-ed together; empty means "any". Named for the
   * brand facet it was introduced for, but the mechanism is generic — any
   * collection subtree can be a facet, which is how a collection page offers
   * its own children (Hello Kitty, Kuromi…) through the same parameter.
   */
  brands: string[];
  /**
   * Selected color families, OR-ed together; empty means "any". Closed
   * vocabulary from `@/lib/catalog/colors` — anything else is dropped at
   * parse time so a hand-edited `?color=chartreuse` cannot widen the query.
   */
  colors: string[];
  /**
   * Selected motif families, OR-ed together; empty means "any". Closed
   * vocabulary from `@/lib/catalog/motifs` — the shopper-facing Theme facet.
   */
  motifs: string[];
  /** Tri-state compatibility facet: MagSafe only / non-MagSafe only / either. */
  magsafe?: boolean;
  sort: SortValue;
  /** 1-based page number. */
  page: number;
};

/**
 * Facets whose change invalidates the current page offset. Listed explicitly so
 * {@link buildCatalogHref} can reset pagination on its own — landing on page 7
 * of a two-page result is the classic faceted-search bug, and it should not be
 * every call site's job to remember to avoid it.
 */
const FILTER_KEYS = [
  "q",
  "tag",
  "device",
  "collection",
  "brands",
  "colors",
  "motifs",
  "magsafe",
  "sort",
] as const satisfies readonly (keyof CatalogParams)[];

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function parseSearch(value: string | string[] | undefined): string | undefined {
  const normalized = first(value)?.replace(/\s+/g, " ").slice(0, MAX_SEARCH_LENGTH);
  return normalized || undefined;
}

function parseSlug(
  value: string | string[] | undefined,
  pattern: RegExp = SLUG_PATTERN,
): string | undefined {
  const normalized = first(value)?.toLowerCase();
  return normalized && pattern.test(normalized) ? normalized : undefined;
}

function isSortValue(value: string | undefined): value is SortValue {
  return SORT_VALUES.includes(value as SortValue);
}

/**
 * Normalise the repeatable `brand` param: drop anything that isn't slug-shaped,
 * de-duplicate, sort, and cap. Sorting makes the URL canonical — two shoppers
 * who tick the same brands in a different order share the same link.
 */
function parseBrands(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  const raw = Array.isArray(value) ? value : [value];
  const slugs = raw
    // Tolerate `?brand=sanrio,disney` as well as repeated keys.
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => SLUG_PATTERN.test(entry));
  return [...new Set(slugs)].sort().slice(0, MAX_BRANDS);
}

/**
 * Normalise the repeatable `color` param against the closed family list.
 * Unknown values are dropped (a typo is not a filter); order is the taxonomy
 * order, not tick order, so two shoppers who pick Pink then Blue share a URL
 * with the one who picked Blue then Pink.
 */
function parseColors(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  const raw = Array.isArray(value) ? value : [value];
  const slugs = raw
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim().toLowerCase())
    .filter(isColorFamilySlug);
  const unique = new Set(slugs);
  return COLOR_FAMILY_SLUGS.filter((slug) => unique.has(slug)).slice(
    0,
    MAX_COLORS,
  );
}

function parseMotifs(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  const raw = Array.isArray(value) ? value : [value];
  const slugs = raw
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim().toLowerCase())
    .filter(isMotifFamilySlug);
  const unique = new Set(slugs);
  return MOTIF_FAMILY_SLUGS.filter((slug) => unique.has(slug)).slice(
    0,
    MAX_MOTIFS,
  );
}

function parsePage(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 1 ? Math.min(page, MAX_PAGE) : 1;
}

/**
 * Decode a request's query string into validated catalog state.
 *
 * `basePath` is required rather than defaulted: a surface that forgot to say
 * where it lives would silently emit `/products` links from every control on
 * the page, which is a far worse failure than a type error.
 */
export function parseCatalogParams(
  sp: CatalogSearchParams,
  basePath: string,
): CatalogParams {
  const magsafe = first(sp.magsafe);
  const sort = first(sp.sort);
  return {
    basePath,
    q: parseSearch(sp.q),
    tag: parseSlug(sp.tag, TAG_PATTERN),
    device: parseSlug(sp.device),
    collection: parseSlug(sp.collection),
    brands: parseBrands(sp.brand),
    colors: parseColors(sp.color),
    motifs: parseMotifs(sp.motif),
    magsafe: magsafe === "true" ? true : magsafe === "false" ? false : undefined,
    sort: isSortValue(sort) ? sort : DEFAULT_SORT,
    page: parsePage(first(sp.page)),
  };
}

/**
 * Serialise catalog state back to a URL on its own `basePath`, applying
 * `overrides` on top. Defaults (page 1, newest-first) are omitted so the common
 * case stays a clean, canonical path, and touching any facet resets pagination
 * unless the caller explicitly sets a page.
 */
export function buildCatalogHref(
  params: CatalogParams,
  overrides: Partial<CatalogParams> = {},
): string {
  const next: CatalogParams = { ...params, ...overrides };
  if (!("page" in overrides) && FILTER_KEYS.some((key) => key in overrides)) {
    next.page = 1;
  }

  const qs = new URLSearchParams();
  if (next.q) qs.set("q", next.q);
  if (next.tag) qs.set("tag", next.tag);
  if (next.device) qs.set("device", next.device);
  if (next.collection) qs.set("collection", next.collection);
  for (const brand of next.brands) qs.append("brand", brand);
  for (const color of next.colors) qs.append("color", color);
  for (const motif of next.motifs) qs.append("motif", motif);
  if (next.magsafe !== undefined) qs.set("magsafe", String(next.magsafe));
  if (next.sort !== DEFAULT_SORT) qs.set("sort", next.sort);
  if (next.page > 1) qs.set("page", String(next.page));

  const query = qs.toString();
  return query ? `${next.basePath}?${query}` : next.basePath;
}

/** True when the shopper has narrowed the catalog in any way. */
export function hasActiveFilters(params: CatalogParams): boolean {
  return Boolean(
    params.q ||
      params.tag ||
      params.device ||
      params.collection ||
      params.magsafe !== undefined ||
      params.brands.length > 0 ||
      params.colors.length > 0 ||
      params.motifs.length > 0,
  );
}

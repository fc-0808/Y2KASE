import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { cache as reactCache } from "react";
import { db, isDbConfigured } from "@/lib/db";
import { CACHE_TAGS, cachedCatalogRead } from "@/lib/cache";
import {
  collections,
  productCollections,
  productImages,
  products,
} from "@/lib/db/schema";
import type { Collection } from "@/lib/db/schema";
import { isStorefrontRenderableUrl } from "@/lib/catalog/storefront-media";

/** A collection enriched with its children and product counts, for menus/pages. */
export type CollectionNode = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  kind: string;
  parentId: number | null;
  icon: string | null;
  imageUrl: string | null;
  accentColor: string | null;
  featured: boolean;
  /** Active products assigned directly to this collection. */
  directCount: number;
  /** Active products in this collection OR any descendant (distinct). */
  totalCount: number;
  children: CollectionNode[];
};

/** Membership pairs (collectionId → set of active product ids). */
async function activeMembership(): Promise<Map<number, Set<number>>> {
  const rows = await db
    .select({
      collectionId: productCollections.collectionId,
      productId: productCollections.productId,
    })
    .from(productCollections)
    .innerJoin(products, eq(products.id, productCollections.productId))
    .where(eq(products.status, "active"));

  const map = new Map<number, Set<number>>();
  for (const r of rows) {
    let set = map.get(r.collectionId);
    if (!set) map.set(r.collectionId, (set = new Set()));
    set.add(r.productId);
  }
  return map;
}

/**
 * Build the full active collection tree (top-level → children), each node
 * carrying direct and subtree-distinct product counts. Used by the mega-menu,
 * the /collections index and collection landing pages.
 *
 * This runs in the shared `SiteHeader` (root layout) on *every* page, so its
 * cost is paid site-wide. It is therefore wrapped in two cache layers:
 *  - `cachedCatalogRead` — a cross-request Data Cache entry, tagged so admin edits
 *    invalidate it on demand, turning a full `product_collections ⨝ products`
 *    scan into a single cached read.
 *  - React `cache` — request-level memoization so the layout and the page that
 *    both call this within one render share a single computation.
 */
const getCollectionTreeCached = cachedCatalogRead(
  computeCollectionTree,
  ["collection-tree"],
  { tags: [CACHE_TAGS.collections, CACHE_TAGS.products] },
);

export const getCollectionTree = reactCache(
  async (): Promise<CollectionNode[]> => {
    if (!isDbConfigured()) return [];
    return getCollectionTreeCached();
  },
);

async function computeCollectionTree(): Promise<CollectionNode[]> {
  if (!isDbConfigured()) return [];

  const [rows, membership] = await Promise.all([
    db.query.collections.findMany({
      where: eq(collections.status, "active"),
      orderBy: (c, { asc }) => [asc(c.position), asc(c.name)],
    }),
    activeMembership(),
  ]);

  const nodeById = new Map<number, CollectionNode>();
  for (const c of rows) {
    nodeById.set(c.id, {
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      kind: c.kind,
      parentId: c.parentId,
      icon: c.icon,
      imageUrl: c.imageUrl,
      accentColor: c.accentColor,
      featured: c.featured,
      directCount: membership.get(c.id)?.size ?? 0,
      totalCount: 0,
      children: [],
    });
  }

  const roots: CollectionNode[] = [];
  for (const node of nodeById.values()) {
    if (node.parentId && nodeById.has(node.parentId)) {
      nodeById.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Subtree-distinct counts (union of own + descendants' product ids).
  function fill(node: CollectionNode): Set<number> {
    const ids = new Set<number>(membership.get(node.id) ?? []);
    for (const child of node.children) {
      for (const id of fill(child)) ids.add(id);
    }
    node.totalCount = ids.size;
    return ids;
  }
  roots.forEach(fill);

  return roots;
}

async function computeCollectionBySlug(slug: string): Promise<Collection | null> {
  const row = await db.query.collections.findFirst({
    where: and(eq(collections.slug, slug), eq(collections.status, "active")),
  });
  return row ?? null;
}

const getCollectionBySlugCached = cachedCatalogRead(
  computeCollectionBySlug,
  ["active-collection-by-slug-v1"],
  {
    tags: [CACHE_TAGS.collections],
  },
);

/** Active collection by slug, cached across requests and deduped within a render. */
export const getCollectionBySlug = reactCache(async function getCollectionBySlug(
  slug: string,
): Promise<Collection | null> {
  if (!isDbConfigured()) return null;
  return getCollectionBySlugCached(slug);
});

/** Direct children of a collection (active), ordered for display. */
export async function getCollectionChildren(
  parentId: number,
): Promise<Collection[]> {
  if (!isDbConfigured()) return [];
  return db.query.collections.findMany({
    where: and(
      eq(collections.parentId, parentId),
      eq(collections.status, "active"),
    ),
    orderBy: (c, { asc }) => [asc(c.position), asc(c.name)],
  });
}

export type CollectionBreadcrumbItem = Pick<Collection, "id" | "slug" | "name">;

/** Ancestor chain (root → … → self), derived from the already-cached tree. */
export async function getCollectionBreadcrumb(
  collection: Collection,
): Promise<CollectionBreadcrumbItem[]> {
  if (!isDbConfigured()) return [collection];

  const tree = await getCollectionTree();
  function pathTo(
    nodes: CollectionNode[],
    targetId: number,
    ancestors: CollectionNode[] = [],
  ): CollectionNode[] | null {
    for (const node of nodes) {
      const path = [...ancestors, node];
      if (node.id === targetId) return path;
      const nested = pathTo(node.children, targetId, path);
      if (nested) return nested;
    }
    return null;
  }

  const path = pathTo(tree, collection.id);
  return path?.map(({ id, slug, name }) => ({ id, slug, name })) ?? [collection];
}

/**
 * The bare hierarchy (id → slug → parent), memoized per request.
 *
 * A single catalog render resolves collection ids several times — once for the
 * browse context, once for the brand facet, once more for each facet's own
 * count — and they all walk the same tiny table. React `cache` collapses those
 * into one read without any caller having to thread the result around.
 */
const getCollectionHierarchy = reactCache(async () => {
  const all = await db.query.collections.findMany({
    columns: { id: true, slug: true, parentId: true },
  });

  const idBySlug = new Map<string, number>();
  const childrenOf = new Map<number, number[]>();
  for (const c of all) {
    idBySlug.set(c.slug, c.id);
    if (c.parentId == null) continue;
    const siblings = childrenOf.get(c.parentId) ?? [];
    siblings.push(c.id);
    childrenOf.set(c.parentId, siblings);
  }
  return { idBySlug, childrenOf };
});

/**
 * Resolve collection slugs to the set of collection ids a product filter should
 * match — each collection plus all of its descendants, so browsing "Sanrio"
 * includes products filed only under "Hello Kitty".
 *
 * Multiple slugs resolve to the UNION of their subtrees, which is the standard
 * "any of these" semantics for a multi-select facet. Slugs that don't exist
 * contribute nothing; an empty result therefore means "nothing can match", and
 * callers translate that into zero products rather than the whole catalog.
 */
export async function resolveCollectionFilterIds(
  slugOrSlugs: string | string[],
): Promise<number[]> {
  if (!isDbConfigured()) return [];
  const slugs = Array.isArray(slugOrSlugs) ? slugOrSlugs : [slugOrSlugs];
  if (slugs.length === 0) return [];

  const { idBySlug, childrenOf } = await getCollectionHierarchy();
  const stack = slugs
    .map((slug) => idBySlug.get(slug))
    .filter((id): id is number => id !== undefined);

  const ids = new Set<number>();
  while (stack.length) {
    const id = stack.pop()!;
    // Doubles as the cycle guard: a mis-parented row can't spin this forever.
    if (ids.has(id)) continue;
    ids.add(id);
    for (const child of childrenOf.get(id) ?? []) stack.push(child);
  }
  return [...ids];
}

/** One selectable option in the catalog's Brand facet. */
export type BrandFacet = {
  slug: string;
  name: string;
  icon: string | null;
  accentColor: string | null;
  /**
   * Stocked character children, when the brand has them. The `/products` brand
   * menu nests these under the parent so a shopper who picked Sanrio can narrow
   * to Hello Kitty without leaving the catalog. Empty/omitted on surfaces that
   * already *are* a brand landing page (those offer the children as the facet).
   */
  children?: BrandFacet[];
};

/**
 * The brands offered as catalog filter options: top-level `brand` nodes that
 * actually hold stock, in merchandised (taxonomy) order — the same order and
 * the same source as the nav mega-menu, so the two can never disagree about
 * which brands exist.
 *
 * Stock-less brands (and stock-less children) are dropped rather than greyed
 * out: the taxonomy carries IP we can classify but may not stock yet, and an
 * option that can never match anything is noise. Contextual zero-counts (a
 * brand that exists but has no match under the *current* filters) are a
 * different case and stay visible — see `getCatalogFacetCounts`.
 */
export async function getBrandFacets(): Promise<BrandFacet[]> {
  const tree = await getCollectionTree();
  return tree
    .filter((node) => node.kind === "brand" && node.totalCount > 0)
    .map(({ slug, name, icon, accentColor, children }) => ({
      slug,
      name,
      icon,
      accentColor,
      children: children
        .filter((child) => child.totalCount > 0)
        .map((child) => ({
          slug: child.slug,
          name: child.name,
          icon: child.icon,
          accentColor: child.accentColor,
        })),
    }));
}

/** All collection ids a single product belongs to (for the admin editor). */
export async function getProductCollectionIds(
  productId: number,
): Promise<number[]> {
  if (!isDbConfigured()) return [];
  const rows = await db
    .select({ collectionId: productCollections.collectionId })
    .from(productCollections)
    .where(eq(productCollections.productId, productId));
  return rows.map((r) => r.collectionId);
}

/** Flat list of all collections (any status) for admin management. */
export async function getAllCollections(): Promise<Collection[]> {
  if (!isDbConfigured()) return [];
  return db.query.collections.findMany({
    orderBy: (c, { asc }) => [asc(c.position), asc(c.name)],
  });
}

/** Option for admin pickers: flat, depth-indented, with live counts. */
export type AdminCollectionOption = {
  id: number;
  slug: string;
  name: string;
  /** Indented label, e.g. "Sanrio › Hello Kitty". */
  pathLabel: string;
  kind: string;
  /** Parent collection id, or null for a top-level brand/genre. */
  parentId: number | null;
  /** Emoji icon, when set on the collection. */
  icon: string | null;
  depth: number;
  count: number;
};

/**
 * Flat, hierarchy-ordered collection list for admin dropdowns/facets. Parents
 * precede their children and each carries a breadcrumb-style `pathLabel`.
 */
export async function getAdminCollectionOptions(): Promise<
  AdminCollectionOption[]
> {
  if (!isDbConfigured()) return [];
  const [all, counts] = await Promise.all([
    getAllCollections(),
    getCollectionCounts(),
  ]);

  const byId = new Map(all.map((c) => [c.id, c]));
  const childrenOf = new Map<number | null, typeof all>();
  for (const c of all) {
    const key = c.parentId ?? null;
    const arr = childrenOf.get(key) ?? [];
    arr.push(c);
    childrenOf.set(key, arr);
  }
  for (const arr of childrenOf.values()) {
    arr.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  }

  const out: AdminCollectionOption[] = [];
  function walk(parentId: number | null, depth: number, prefix: string) {
    for (const c of childrenOf.get(parentId) ?? []) {
      const pathLabel = prefix ? `${prefix} › ${c.name}` : c.name;
      out.push({
        id: c.id,
        slug: c.slug,
        name: c.name,
        pathLabel,
        kind: c.kind,
        parentId: c.parentId,
        icon: c.icon,
        depth,
        count: counts.get(c.id) ?? 0,
      });
      walk(c.id, depth + 1, pathLabel);
    }
  }
  walk(null, 0, "");
  // Include any orphans whose parent is missing/inactive.
  for (const c of all) {
    if (
      !out.some((o) => o.id === c.id) &&
      (c.parentId == null || !byId.has(c.parentId))
    ) {
      out.push({
        id: c.id,
        slug: c.slug,
        name: c.name,
        pathLabel: c.name,
        kind: c.kind,
        parentId: c.parentId,
        icon: c.icon,
        depth: 0,
        count: counts.get(c.id) ?? 0,
      });
    }
  }
  return out;
}

/**
 * An ordered POOL of representative product images per collection id — used as
 * the tile art in the homepage category rail. Returning a pool (not a single
 * image) lets the caller assign a DISTINCT photo to each tile, so neighbouring
 * categories (e.g. Kawaii / Y2K / Anime, which share many products) never show
 * the same picture. Each collection's pool is its own product photos first,
 * then its descendants' (so "Sanrio" can borrow "Hello Kitty" shots). One image
 * per product, newest products first, capped for weight.
 */
export async function getCollectionImagePools(): Promise<
  Map<number, string[]>
> {
  if (!isDbConfigured()) return new Map();
  // The Data Cache serializes via JSON, which does not preserve Map instances —
  // so we cache a plain entries array and rebuild the Map per request.
  return new Map(await getCollectionImagePoolEntries());
}

const getCollectionImagePoolEntries = cachedCatalogRead(
  computeCollectionImagePoolEntries,
  ["collection-image-pools-v2"],
  { tags: [CACHE_TAGS.collections, CACHE_TAGS.products] },
);

async function computeCollectionImagePoolEntries(): Promise<
  [number, string[]][]
> {
  const [imgRows, cols] = await Promise.all([
    db
      .select({
        collectionId: productCollections.collectionId,
        productId: products.id,
        url: productImages.url,
        position: productImages.position,
        createdAt: products.createdAt,
      })
      .from(productCollections)
      .innerJoin(products, eq(products.id, productCollections.productId))
      .innerJoin(productImages, eq(productImages.productId, products.id))
      .where(eq(products.status, "active")),
    db.query.collections.findMany({ columns: { id: true, parentId: true } }),
  ]);

  // collectionId → (productId → best/first image of that product)
  const perColProd = new Map<
    number,
    Map<number, { url: string; pos: number; createdAt: Date }>
  >();
  for (const r of imgRows) {
    if (!isStorefrontRenderableUrl(r.url)) continue;
    let pm = perColProd.get(r.collectionId);
    if (!pm) perColProd.set(r.collectionId, (pm = new Map()));
    const cur = pm.get(r.productId);
    if (!cur || r.position < cur.pos) {
      pm.set(r.productId, {
        url: r.url,
        pos: r.position,
        createdAt: (r.createdAt as Date) ?? new Date(0),
      });
    }
  }

  // Direct image list per collection, newest product first.
  const directList = new Map<number, string[]>();
  for (const [cid, pm] of perColProd) {
    const urls = [...pm.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((x) => x.url);
    directList.set(cid, urls);
  }

  const childrenOf = new Map<number, number[]>();
  for (const c of cols) {
    if (c.parentId == null) continue;
    const arr = childrenOf.get(c.parentId) ?? [];
    arr.push(c.id);
    childrenOf.set(c.parentId, arr);
  }

  const CAP = 12;
  function pool(id: number, seen = new Set<number>()): string[] {
    if (seen.has(id)) return [];
    seen.add(id);
    const out: string[] = [];
    const push = (u: string) => {
      if (out.length < CAP && !out.includes(u)) out.push(u);
    };
    for (const u of directList.get(id) ?? []) push(u);
    for (const child of childrenOf.get(id) ?? []) {
      for (const u of pool(child, seen)) push(u);
    }
    return out;
  }

  const result: [number, string[]][] = [];
  for (const c of cols) result.push([c.id, pool(c.id)]);
  return result;
}

export type StorefrontCollectionLink = {
  slug: string;
  name: string;
  kind: string;
};

const COLLECTION_LINK_KIND_RANK: Record<string, number> = {
  character: 0,
  brand: 1,
  feature: 2,
  genre: 3,
};

/**
 * Indexable collection landings a PDP should link to — character first, then
 * brand, MagSafe, genre. Facet URLs stay off this list so we never pass
 * ranking into a noindex filter.
 */
export async function getProductCollectionLinks(
  productId: number,
  limit = 5,
): Promise<StorefrontCollectionLink[]> {
  const [ids, tree] = await Promise.all([
    getProductCollectionIds(productId),
    getCollectionTree(),
  ]);
  if (ids.length === 0) return [];

  const wanted = new Set(ids);
  const found: StorefrontCollectionLink[] = [];

  function walk(nodes: CollectionNode[]): void {
    for (const node of nodes) {
      if (wanted.has(node.id) && node.totalCount > 0) {
        found.push({
          slug: node.slug,
          name: node.name,
          kind: node.kind,
        });
      }
      walk(node.children);
    }
  }
  walk(tree);

  return found
    .sort((a, b) => {
      const rank =
        (COLLECTION_LINK_KIND_RANK[a.kind] ?? 9) -
        (COLLECTION_LINK_KIND_RANK[b.kind] ?? 9);
      return rank || a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

/** Count of products assigned per collection id (active only). */
export async function getCollectionCounts(): Promise<Map<number, number>> {
  if (!isDbConfigured()) return new Map();
  const rows = await db
    .select({
      collectionId: productCollections.collectionId,
      count: sql<number>`count(*)::int`,
    })
    .from(productCollections)
    .innerJoin(products, eq(products.id, productCollections.productId))
    .where(eq(products.status, "active"))
    .groupBy(productCollections.collectionId);
  return new Map(rows.map((r) => [r.collectionId, r.count]));
}

// Re-export so server actions can keep a single import surface.
export { collections, productCollections };
export { asc, inArray };

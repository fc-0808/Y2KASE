import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { cache as reactCache } from "react";
import { db, isDbConfigured } from "@/lib/db";
import { CACHE_TAGS } from "@/lib/cache";
import {
  collections,
  productCollections,
  productImages,
  products,
} from "@/lib/db/schema";
import type { Collection } from "@/lib/db/schema";

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
 *  - `unstable_cache` — a cross-request Data Cache entry, tagged so admin edits
 *    invalidate it on demand (otherwise it refreshes hourly), turning a full
 *    `product_collections ⨝ products` scan into a single cached read.
 *  - React `cache` — request-level memoization so the layout and the page that
 *    both call this within one render share a single computation.
 */
const getCollectionTreeCached = unstable_cache(
  computeCollectionTree,
  ["collection-tree"],
  { tags: [CACHE_TAGS.collections, CACHE_TAGS.products], revalidate: 3600 },
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

/** Flattened map of every active collection by slug (for resolving filters). */
export async function getCollectionBySlug(
  slug: string,
): Promise<Collection | null> {
  if (!isDbConfigured()) return null;
  const row = await db.query.collections.findFirst({
    where: and(eq(collections.slug, slug), eq(collections.status, "active")),
  });
  return row ?? null;
}

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

/** Ancestor chain (root → … → self) for breadcrumbs. */
export async function getCollectionBreadcrumb(
  collection: Collection,
): Promise<Collection[]> {
  if (!isDbConfigured()) return [collection];
  const chain: Collection[] = [collection];
  let parentId = collection.parentId;
  // Bounded walk (taxonomy depth is small); guard against cycles.
  for (let i = 0; i < 8 && parentId; i++) {
    const parent = await db.query.collections.findFirst({
      where: eq(collections.id, parentId),
    });
    if (!parent) break;
    chain.unshift(parent);
    parentId = parent.parentId;
  }
  return chain;
}

/**
 * Resolve a collection slug to the set of collection ids that a product filter
 * should match — the collection itself plus all of its descendants, so
 * browsing "Sanrio" includes products tagged only under "Hello Kitty".
 */
export async function resolveCollectionFilterIds(
  slug: string,
): Promise<number[]> {
  if (!isDbConfigured()) return [];
  const all = await db.query.collections.findMany({
    columns: { id: true, slug: true, parentId: true },
  });
  const root = all.find((c) => c.slug === slug);
  if (!root) return [];

  const childrenOf = new Map<number, number[]>();
  for (const c of all) {
    if (c.parentId == null) continue;
    const arr = childrenOf.get(c.parentId) ?? [];
    arr.push(c.id);
    childrenOf.set(c.parentId, arr);
  }

  const ids: number[] = [];
  const stack = [root.id];
  while (stack.length) {
    const id = stack.pop()!;
    ids.push(id);
    for (const child of childrenOf.get(id) ?? []) stack.push(child);
  }
  return ids;
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

const getCollectionImagePoolEntries = unstable_cache(
  computeCollectionImagePoolEntries,
  ["collection-image-pools"],
  { tags: [CACHE_TAGS.collections, CACHE_TAGS.products], revalidate: 3600 },
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

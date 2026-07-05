/**
 * Near-duplicate product detection from stored perceptual hashes.
 *
 * Compares every product's primary-image dHash against every other's and
 * groups products whose fingerprints are within the Hamming threshold into
 * clusters (a product can chain into a cluster transitively, via union-find).
 * This is the "find products we already have" report for the admin — it runs
 * entirely on cheap integer math over hashes already in the DB, with no model
 * calls, so it scans the whole catalogue in milliseconds.
 */
import { desc } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { hammingDistance, DUPLICATE_THRESHOLD } from "@/lib/catalog/phash";

export type DuplicateProduct = {
  id: number;
  slug: string;
  title: string;
  status: string;
  price: string;
  currency: string;
  imageUrl: string | null;
  phash: string;
};

export type DuplicateCluster = {
  /** Products in this cluster, newest first. */
  products: DuplicateProduct[];
  /** Closest match distance within the cluster (0 = pixel-identical fingerprint). */
  minDistance: number;
};

/** A single closest-match result, used by the ingest-time duplicate check. */
export type NearestDuplicate = {
  id: number;
  slug: string;
  title: string;
  /** Hamming distance to the query hash (lower = more similar). */
  distance: number;
};

/** A product's primary-image fingerprint, for in-memory duplicate matching. */
export type DuplicateIndexEntry = {
  id: number;
  slug: string;
  title: string;
  phash: string;
};

/**
 * Load every product's primary-image fingerprint once, into memory. The bulk
 * ingest builds this a single time and matches each new product against it
 * (see {@link nearestInIndex}) instead of running a full DB scan per product —
 * turning an O(products²) batch into O(products).
 */
export async function loadDuplicateIndex(): Promise<DuplicateIndexEntry[]> {
  if (!isDbConfigured()) return [];
  const rows = await db.query.products.findMany({
    columns: { id: true, slug: true, title: true },
    with: {
      images: {
        columns: { phash: true, position: true },
        orderBy: (img, { asc }) => asc(img.position),
        limit: 1,
      },
    },
    limit: 10000,
  });
  const index: DuplicateIndexEntry[] = [];
  for (const p of rows) {
    const phash = p.images[0]?.phash;
    if (phash) index.push({ id: p.id, slug: p.slug, title: p.title, phash });
  }
  return index;
}

/** Closest entry in a preloaded index within `threshold` (pure, no I/O). */
export function nearestInIndex(
  index: readonly DuplicateIndexEntry[],
  phash: string,
  threshold: number = DUPLICATE_THRESHOLD,
): NearestDuplicate | null {
  if (!phash) return null;
  let best: NearestDuplicate | null = null;
  for (const e of index) {
    const distance = hammingDistance(phash, e.phash);
    if (distance <= threshold && (!best || distance < best.distance)) {
      best = { id: e.id, slug: e.slug, title: e.title, distance };
    }
  }
  return best;
}

/**
 * Find the existing product whose primary-image fingerprint is closest to
 * `phash`, within `threshold`. The standalone (single-shot) form that queries
 * the DB directly — used when no preloaded index is supplied. Run BEFORE
 * inserting the new product so it never matches itself.
 */
export async function findNearestDuplicate(
  phash: string,
  threshold: number = DUPLICATE_THRESHOLD,
): Promise<NearestDuplicate | null> {
  if (!isDbConfigured() || !phash) return null;
  return nearestInIndex(await loadDuplicateIndex(), phash, threshold);
}

// ── Union-find (disjoint set) for transitive clustering ──────────────────────
function makeUnionFind(n: number) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  return { find, union };
}

/**
 * Find clusters of near-duplicate products. Only products whose primary image
 * has a perceptual hash participate (run `npm run backfill:phash` to populate
 * older rows). Returns clusters of 2+ products, most-confident match first.
 */
export async function findDuplicateClusters(
  threshold: number = DUPLICATE_THRESHOLD,
): Promise<DuplicateCluster[]> {
  if (!isDbConfigured()) return [];

  const rows = await db.query.products.findMany({
    columns: {
      id: true,
      slug: true,
      title: true,
      status: true,
      price: true,
      currency: true,
    },
    with: {
      images: {
        columns: { url: true, phash: true, position: true },
        orderBy: (img, { asc }) => asc(img.position),
        limit: 1,
      },
    },
    orderBy: desc(products.createdAt),
    limit: 2000,
  });

  const items: DuplicateProduct[] = [];
  for (const p of rows) {
    const primary = p.images[0];
    if (!primary?.phash) continue;
    items.push({
      id: p.id,
      slug: p.slug,
      title: p.title,
      status: p.status,
      price: p.price,
      currency: p.currency,
      imageUrl: primary.url ?? null,
      phash: primary.phash,
    });
  }

  const n = items.length;
  if (n < 2) return [];

  const { find, union } = makeUnionFind(n);
  // Closest match distance seen for each item (for surfacing confidence).
  const bestDist = new Array<number>(n).fill(Infinity);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = hammingDistance(items[i].phash, items[j].phash);
      if (d <= threshold) {
        union(i, j);
        if (d < bestDist[i]) bestDist[i] = d;
        if (d < bestDist[j]) bestDist[j] = d;
      }
    }
  }

  // Group indices by their union-find root.
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const arr = groups.get(root) ?? [];
    arr.push(i);
    groups.set(root, arr);
  }

  const clusters: DuplicateCluster[] = [];
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    const minDistance = Math.min(...idxs.map((i) => bestDist[i]));
    clusters.push({
      products: idxs.map((i) => items[i]),
      minDistance: Number.isFinite(minDistance) ? minDistance : threshold,
    });
  }

  // Tightest matches first, then larger clusters.
  clusters.sort(
    (a, b) =>
      a.minDistance - b.minDistance || b.products.length - a.products.length,
  );
  return clusters;
}

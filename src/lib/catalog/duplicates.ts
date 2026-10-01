/**
 * Near-duplicate product detection.
 *
 * Loads current-version fingerprints from the catalogue and clusters products
 * that the matcher in `./duplicate-match` accepts. Legacy 16-char dHashes are
 * ignored here (they compare incompatible bit layouts and are the reason the
 * previous report invented a 58-product "identical" group); the admin scan
 * rewrites them to v2.
 *
 * Matching is O(products²) integer math over each listing's primary-image
 * fingerprint — a few thousand products is still milliseconds. Gallery extras
 * (strap / MagSafe close-ups) are ignored; those files are reused across SKUs
 * and would otherwise report Tamagotchi as a duplicate of Stitch.
 */
import { desc } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { isCurrentFingerprint } from "@/lib/catalog/phash-types";
import {
  completeLinkageClusters,
  confidenceForCluster,
  decidePair,
  pairConfidence,
  type DuplicateConfidence,
  type DuplicateQuery,
  type MatchKind,
} from "@/lib/catalog/duplicate-match";

export type { DuplicateConfidence, DuplicateQuery };
export type { DuplicateIdentity, PairDecision } from "@/lib/catalog/duplicate-match";

export type DuplicateProduct = {
  id: number;
  slug: string;
  title: string;
  status: string;
  price: string;
  currency: string;
  imageUrl: string | null;
  phash: string;
  productType: string;
  brandName: string | null;
  characterName: string | null;
};

export type DuplicateCluster = {
  /** Products in this cluster, newest first. */
  products: DuplicateProduct[];
  /** Closest combined visual cost inside the cluster. */
  minDistance: number;
  /** Worst combined visual cost inside the cluster (the diameter). */
  maxDistance: number;
  confidence: DuplicateConfidence;
};

/** A single closest-match result, used by the ingest-time duplicate check. */
export type NearestDuplicate = {
  id: number;
  slug: string;
  title: string;
  /** Combined visual cost (lower = more similar). */
  distance: number;
  confidence: DuplicateConfidence;
};

/** A product's fingerprints + identity, for in-memory duplicate matching. */
export type DuplicateIndexEntry = {
  id: number;
  slug: string;
  title: string;
  phash: string;
  phashes: string[];
  productType: string | null;
  brandName: string | null;
  characterName: string | null;
};

const CATALOGUE_LIMIT = 10000;

/**
 * Load every product's current fingerprints once, into memory. The bulk
 * ingest builds this a single time and matches each new product against it
 * (see {@link nearestInIndex}) instead of running a full DB scan per product.
 */
export async function loadDuplicateIndex(): Promise<DuplicateIndexEntry[]> {
  if (!isDbConfigured()) return [];
  const rows = await db.query.products.findMany({
    columns: {
      id: true,
      slug: true,
      title: true,
      productType: true,
      brandName: true,
      characterName: true,
    },
    with: {
      images: {
        columns: { phash: true, position: true },
        orderBy: (img, { asc }) => asc(img.position),
      },
    },
    limit: CATALOGUE_LIMIT,
  });
  const index: DuplicateIndexEntry[] = [];
  for (const p of rows) {
    const primary = p.images.find((img) => isCurrentFingerprint(img.phash));
    const phash = primary?.phash;
    if (!phash) continue;
    index.push({
      id: p.id,
      slug: p.slug,
      title: p.title,
      phash,
      phashes: [phash],
      productType: p.productType,
      brandName: p.brandName,
      characterName: p.characterName,
    });
  }
  return index;
}

/** Closest entry in a preloaded index that the matcher accepts (pure, no I/O). */
export function nearestInIndex(
  index: readonly DuplicateIndexEntry[],
  query: string | DuplicateQuery,
): NearestDuplicate | null {
  const q: DuplicateQuery =
    typeof query === "string" ? { phash: query, title: "" } : query;
  if (!q.phash && !(q.phashes && q.phashes.length > 0)) return null;
  const queryHashes = collectQueryHashes(q);
  if (queryHashes.length === 0) return null;

  let best: NearestDuplicate | null = null;
  for (const e of index) {
    const decision = decidePair(
      queryHashes,
      e.phashes.length > 0 ? e.phashes : [e.phash],
      q,
      {
        title: e.title,
        productType: e.productType,
        brandName: e.brandName,
        characterName: e.characterName,
      },
    );
    if (!decision.matched || !decision.distances || !decision.kind) continue;
    const distance = decision.distances.combined;
    if (!best || distance < best.distance) {
      best = {
        id: e.id,
        slug: e.slug,
        title: e.title,
        distance,
        confidence: pairConfidence(decision.kind) ?? "very_likely",
      };
    }
  }
  return best;
}

/**
 * Find the existing product whose photos match `query`. The standalone
 * (single-shot) form that queries the DB directly — used when no preloaded
 * index is supplied. Run BEFORE inserting the new product so it never
 * matches itself.
 */
export async function findNearestDuplicate(
  query: string | DuplicateQuery,
): Promise<NearestDuplicate | null> {
  if (!isDbConfigured()) return null;
  return nearestInIndex(await loadDuplicateIndex(), query);
}

/**
 * Find clusters of duplicate products. Only current-version fingerprints
 * participate. Returns clusters of 2+ products, most-confident first.
 */
export async function findDuplicateClusters(): Promise<DuplicateCluster[]> {
  if (!isDbConfigured()) return [];

  const rows = await db.query.products.findMany({
    columns: {
      id: true,
      slug: true,
      title: true,
      status: true,
      price: true,
      currency: true,
      productType: true,
      brandName: true,
      characterName: true,
    },
    with: {
      images: {
        columns: { url: true, phash: true, position: true },
        orderBy: (img, { asc }) => asc(img.position),
      },
    },
    orderBy: desc(products.createdAt),
    limit: CATALOGUE_LIMIT,
  });

  const items: (DuplicateProduct & { phashes: string[] })[] = [];
  for (const p of rows) {
    const primary = p.images.find((img) => isCurrentFingerprint(img.phash));
    const phash = primary?.phash;
    if (!phash) continue;
    items.push({
      id: p.id,
      slug: p.slug,
      title: p.title,
      status: p.status,
      price: p.price,
      currency: p.currency,
      imageUrl: primary.url ?? null,
      phash,
      productType: p.productType,
      brandName: p.brandName,
      characterName: p.characterName,
      phashes: [phash],
    });
  }

  const n = items.length;
  if (n < 2) return [];

  type Edge = { kind: MatchKind; combined: number };
  const edges = new Map<string, Edge>();
  const keyOf = (i: number, j: number) => (i < j ? `${i}:${j}` : `${j}:${i}`);

  for (let i = 0; i < n; i++) {
    const a = items[i]!;
    for (let j = i + 1; j < n; j++) {
      const b = items[j]!;
      const decision = decidePair(a.phashes, b.phashes, a, b);
      if (!decision.matched || !decision.kind || !decision.distances) continue;
      edges.set(keyOf(i, j), {
        kind: decision.kind,
        combined: decision.distances.combined,
      });
    }
  }

  const groups = completeLinkageClusters(
    n,
    (i, j) => i === j || edges.has(keyOf(i, j)),
  );

  const clusters: DuplicateCluster[] = [];
  for (const idxs of groups) {
    let minDistance = Infinity;
    let maxDistance = 0;
    const kinds: MatchKind[] = [];
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const edge = edges.get(keyOf(idxs[a]!, idxs[b]!));
        if (!edge) continue;
        kinds.push(edge.kind);
        if (edge.combined < minDistance) minDistance = edge.combined;
        if (edge.combined > maxDistance) maxDistance = edge.combined;
      }
    }
    clusters.push({
      products: idxs.map((i) => stripPhashes(items[i]!)),
      minDistance: Number.isFinite(minDistance) ? minDistance : 0,
      maxDistance,
      confidence: confidenceForCluster(kinds),
    });
  }

  const rank: Record<DuplicateConfidence, number> = {
    identical: 0,
    very_likely: 1,
    possible: 2,
  };
  clusters.sort(
    (a, b) =>
      rank[a.confidence] - rank[b.confidence] ||
      a.maxDistance - b.maxDistance ||
      b.products.length - a.products.length,
  );
  return clusters;
}

function currentHashes(values: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!isCurrentFingerprint(value) || !value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function collectQueryHashes(query: DuplicateQuery): string[] {
  const values =
    query.phashes && query.phashes.length > 0 ? query.phashes : [query.phash];
  return currentHashes(values);
}

function stripPhashes(
  item: DuplicateProduct & { phashes: string[] },
): DuplicateProduct {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    status: item.status,
    price: item.price,
    currency: item.currency,
    imageUrl: item.imageUrl,
    phash: item.phash,
    productType: item.productType,
    brandName: item.brandName,
    characterName: item.characterName,
  };
}

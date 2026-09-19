/**
 * Homepage collection-rail merchandising.
 *
 * Editorial rails (Originals, Sanrio, Hello Kitty, …) are *discovery* surfaces,
 * not "newest arrivals" feeds. A bulk upload of one product type — fifty
 * AirPods cases on a Tuesday — must not hide the iPhone cases that collection
 * already sells. The catalog listing can stay recency-friendly; the homepage
 * cannot.
 *
 * The mix is dynamic on purpose: it never hard-codes iPhone vs AirPods. It
 * reads whichever `productType` values are actually stocked in the candidate
 * set, so a later MacBook or Watch line gets the same treatment the day it
 * ships, and a collection that genuinely only sells one type still fills with
 * that type.
 *
 * ── Ranking (within a type) ────────────────────────────────────────────────
 * Featured first (hand-merchandised quality), then recency. New uploads still
 * appear — as the newest of *their* type — without occupying every slot.
 *
 * ── Quotas (across types) ──────────────────────────────────────────────────
 * Sainte-Laguë on square-root counts, with a monopoly cap. Square-root
 * damping is the classic IR trick: 200 iPhone vs 20 AirPods becomes roughly
 * 8 / 4 of a 12-slot rail, not 11 / 1 and not 6 / 6. The cap
 * (`typeShareCap`) is the backstop so two healthy types cannot collapse to a
 * single-type strip even when one dwarfs the other.
 *
 * ── Weave ──────────────────────────────────────────────────────────────────
 * Slots are filled round-robin, refusing to repeat a type while another still
 * has quota. The majority type leads. Shoppers see breadth in the first
 * screenful; leftover majority items trail rather than clump at the front.
 *
 * Pure: no I/O, no React, no database. `getCollectionRail` ranks from Postgres
 * then calls {@link merchandiseCollectionRail}; the homepage de-dupe pass
 * calls {@link selectDiverseRail} so a product reserved by an earlier rail
 * cannot re-collapse the mix.
 */

export type RailMixCandidate = {
  id: number;
  productType: string;
  featured: boolean;
  featuredPosition: number | null;
  createdAt: Date | string | number;
};

/** Hard ceiling so a bad caller cannot ask the mixer for the whole catalog. */
const MIX_LIMIT_CEILING = 500;

/**
 * Maximum share any one type may occupy when `typeCount` types are stocked.
 *
 *   1 type  → 100% (the collection really is AirPods-only)
 *   2 types → 2/3
 *   3 types → 1/2
 *   4 types → 2/5
 *
 * Derived from `1 / (1 + 0.5*(k-1))` so the cap tightens as the assortment
 * widens, without starving a majority type of the lead slot.
 */
export function typeShareCap(typeCount: number): number {
  if (typeCount <= 1) return 1;
  return 1 / (1 + 0.5 * (typeCount - 1));
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 0;
  return Math.min(MIX_LIMIT_CEILING, Math.max(0, Math.trunc(limit)));
}

/**
 * Allocate `limit` slots across types given their stocked counts.
 *
 * Always sums to `min(limit, Σ counts)`. Types with stock get at least one
 * slot whenever `limit` allows. A type cannot exceed `typeShareCap` until
 * every other type is exhausted — then leftover slots spill, so a 12-slot
 * rail of 11 iPhone + 1 AirPods still fills.
 */
export function allocateTypeQuotas(
  counts: readonly number[],
  limit: number,
): number[] {
  const n = counts.length;
  const quotas = Array.from({ length: n }, () => 0);
  if (n === 0) return quotas;

  const stock = counts.map((count) => Math.max(0, Math.trunc(count)));
  const totalItems = stock.reduce((sum, count) => sum + count, 0);
  let remaining = Math.min(clampLimit(limit), totalItems);
  if (remaining === 0) return quotas;
  if (remaining === totalItems) return stock;
  if (n === 1) {
    quotas[0] = remaining;
    return quotas;
  }

  const maxSlots = Math.max(1, Math.floor(clampLimit(limit) * typeShareCap(n)));

  const present: number[] = [];
  for (let i = 0; i < n; i++) {
    if (stock[i]! > 0) present.push(i);
  }
  if (remaining >= present.length) {
    for (const i of present) {
      quotas[i] = 1;
      remaining -= 1;
    }
  }

  const cappedCapacity = (i: number) =>
    Math.max(0, Math.min(stock[i]!, maxSlots) - quotas[i]!);

  while (remaining > 0) {
    let pick = -1;
    let best = -Infinity;
    for (let i = 0; i < n; i++) {
      if (cappedCapacity(i) <= 0) continue;
      const score = Math.sqrt(stock[i]!) / (2 * quotas[i]! + 1);
      if (
        score > best ||
        (score === best && pick >= 0 && stock[i]! > stock[pick]!)
      ) {
        best = score;
        pick = i;
      }
    }

    if (pick < 0) {
      let spill = -1;
      for (let i = 0; i < n; i++) {
        const extra = stock[i]! - quotas[i]!;
        if (extra <= 0) continue;
        if (
          spill < 0 ||
          extra > stock[spill]! - quotas[spill]! ||
          (extra === stock[spill]! - quotas[spill]! && stock[i]! > stock[spill]!)
        ) {
          spill = i;
        }
      }
      if (spill < 0) break;
      quotas[spill]! += 1;
      remaining -= 1;
      continue;
    }

    quotas[pick]! += 1;
    remaining -= 1;
  }

  return quotas;
}

function timestampMs(value: Date | string | number): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareRailRank(a: RailMixCandidate, b: RailMixCandidate): number {
  if (a.featured !== b.featured) return a.featured ? -1 : 1;
  const posA = a.featuredPosition ?? Number.POSITIVE_INFINITY;
  const posB = b.featuredPosition ?? Number.POSITIVE_INFINITY;
  if (posA !== posB) return posA - posB;
  const timeA = timestampMs(a.createdAt);
  const timeB = timestampMs(b.createdAt);
  if (timeA !== timeB) return timeB - timeA;
  return b.id - a.id;
}

function typeKey(productType: string | null | undefined): string {
  return productType && productType.length > 0 ? productType : "_unknown";
}

/**
 * Fill slots from per-type buckets without letting one type clump while
 * another still has quota. Majority type (largest bucket, then slug) leads.
 */
function weaveTypeBuckets<T>(
  buckets: readonly T[][],
  quotas: readonly number[],
): T[] {
  const heads = buckets.map(() => 0);
  const remaining = quotas.map((quota, i) =>
    Math.min(Math.max(0, quota), buckets[i]?.length ?? 0),
  );
  const out: T[] = [];
  let last = -1;

  while (true) {
    let pick = -1;
    let best = -Infinity;
    for (let i = 0; i < buckets.length; i++) {
      if (remaining[i]! <= 0) continue;
      if (heads[i]! >= (buckets[i]?.length ?? 0)) continue;
      const diversity = i === last ? 0 : 1;
      const score =
        diversity * 1_000_000 +
        remaining[i]! * 1_000 +
        (buckets[i]?.length ?? 0);
      if (score > best) {
        best = score;
        pick = i;
      }
    }
    if (pick < 0) break;
    out.push(buckets[pick]![heads[pick]!]!);
    heads[pick]! += 1;
    remaining[pick]! -= 1;
    last = pick;
  }

  return out;
}

function mixBuckets<T>(buckets: Map<string, T[]>, limit: number): T[] {
  const types = [...buckets.entries()]
    .filter(([, items]) => items.length > 0)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  if (types.length === 0 || limit <= 0) return [];
  const quotas = allocateTypeQuotas(
    types.map(([, items]) => items.length),
    limit,
  );
  return weaveTypeBuckets(
    types.map(([, items]) => items),
    quotas,
  );
}

/**
 * Rank + mix a collection's stocked products into a homepage rail.
 *
 * Callers fetch a *skinny* candidate list (id / type / featured / createdAt)
 * for every imaged active member — not just the newest `limit` rows — so a
 * type that was not uploaded today still has a voice. The mixer then returns
 * at most `limit` ids, in display order.
 */
export function merchandiseCollectionRail<T extends RailMixCandidate>(
  candidates: readonly T[],
  opts: { limit: number },
): T[] {
  const limit = clampLimit(opts.limit);
  if (limit === 0 || candidates.length === 0) return [];

  const seen = new Set<number>();
  const byType = new Map<string, T[]>();
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    const key = typeKey(candidate.productType);
    const bucket = byType.get(key);
    if (bucket) bucket.push(candidate);
    else byType.set(key, [candidate]);
  }

  for (const bucket of byType.values()) {
    bucket.sort(compareRailRank);
  }

  return mixBuckets(byType, limit);
}

/**
 * Second-pass mixer for an already-ranked list (the homepage de-dupe).
 *
 * Preserves relative order within each type — `getCollectionRail` already
 * ranked them — then re-weaves so skipping products reserved by Bestsellers
 * or an earlier rail cannot leave a single-type strip.
 */
export function selectDiverseRail<
  T extends {
    id: number;
    productType?: string | null;
    imageUrl?: string | null;
  },
>(
  items: readonly T[],
  opts: {
    limit: number;
    usedIds?: ReadonlySet<number>;
    requireImage?: boolean;
  },
): T[] {
  const limit = clampLimit(opts.limit);
  if (limit === 0) return [];

  const usedIds = opts.usedIds;
  const requireImage = opts.requireImage ?? true;
  const seen = new Set<number>();
  const byType = new Map<string, T[]>();

  for (const item of items) {
    if (seen.has(item.id)) continue;
    if (usedIds?.has(item.id)) continue;
    if (requireImage && !item.imageUrl) continue;
    seen.add(item.id);
    const key = typeKey(item.productType);
    const bucket = byType.get(key);
    if (bucket) bucket.push(item);
    else byType.set(key, [item]);
  }

  return mixBuckets(byType, limit);
}

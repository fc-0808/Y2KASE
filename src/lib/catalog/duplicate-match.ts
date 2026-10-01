/**
 * Duplicate *decision* layer — pure functions, no I/O, no Sharp.
 *
 * Visual similarity (see `./phash`) is evidence, not a verdict. Production
 * dedup engines that survived false-positive incidents (DedupTool's dHash
 * failure write-up; Stanford IR on single-link chaining) all do the same
 * three things this module encodes:
 *
 *   1. Independent hashes must corroborate (handled in `./phash`).
 *   2. Identity hard-gates: an iPhone case is never an AirPods case; a
 *      Rilakkuma listing is never a Hello Kitty listing.
 *   3. Clustering is complete-linkage, not union-find. Single-link / DSU
 *      chaining is how 126 weak dHash edges became a 58-product "identical"
 *      group of unrelated pastel shells.
 */
import {
  classifyVisual,
  parseFingerprint,
  visualDistances,
  type Fingerprint,
  type VisualDistances,
  type VisualKind,
} from "@/lib/catalog/phash";

export type DuplicateConfidence = "identical" | "very_likely" | "possible";

export type DuplicateIdentity = {
  title: string;
  productType?: string | null;
  brandName?: string | null;
  characterName?: string | null;
};

export type DuplicateQuery = DuplicateIdentity & {
  phash: string;
  /** Optional gallery fingerprints; primary `phash` is used when omitted. */
  phashes?: string[];
};

/**
 * Catalogue nouns that appear on almost every listing. Matching on these is
 * how "clear phone case with beaded strap" looked like a duplicate of every
 * other clear phone case with a beaded strap. Character / design words stay.
 */
export const TITLE_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "with",
  "for",
  "of",
  "in",
  "on",
  "to",
  "by",
  "from",
  "phone",
  "case",
  "cases",
  "cover",
  "covers",
  "shell",
  "iphone",
  "airpods",
  "airpod",
  "pro",
  "max",
  "plus",
  "mini",
  "magsafe",
  "magnetic",
  "clear",
  "cute",
  "kawaii",
  "pastel",
  "charm",
  "charms",
  "beaded",
  "strap",
  "wrist",
  "ring",
  "stand",
  "grip",
  "cartoon",
  "sticker",
  "style",
  "friends",
  "foldable",
  "glitter",
  "pop",
  "bubble",
  "y2k",
  "y2kase",
  "y2case",
  "shop",
  "new",
  "soft",
  "hard",
  "silicone",
  "transparent",
  "print",
  "printed",
  "design",
  "camera",
]);

/** Distinctive tokens used for title corroboration. Exported for the guard. */
export function distinctiveTokens(title: string): Set<string> {
  const out = new Set<string>();
  const parts = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  for (const part of parts) {
    if (part.length < 3) continue;
    if (/^\d+$/.test(part)) continue;
    if (TITLE_STOPWORDS.has(part)) continue;
    out.add(part);
  }
  return out;
}

export type TitleScore = {
  /** Jaccard on distinctive tokens after dropping shared brand/character words. */
  jaccard: number;
  /** Size of the intersection after the same drop. */
  intersection: number;
  /** True when the titles actually corroborate a visual candidate. */
  corroborates: boolean;
};

/**
 * Title corroboration. Shared brand/character tokens are stripped first so
 * "Miffy Starry …" vs "Miffy Chef …" does not match on the word "miffy".
 * Requires two remaining overlapping tokens (or a high Jaccard) — one shared
 * adjective is how pastel shells chained together.
 */
export function scoreTitle(
  a: DuplicateIdentity,
  b: DuplicateIdentity,
): TitleScore {
  const drop = new Set<string>([
    ...nameTokens(a.characterName),
    ...nameTokens(b.characterName),
    ...nameTokens(a.brandName),
    ...nameTokens(b.brandName),
  ]);
  const tokensA = dropTokens(distinctiveTokens(a.title), drop);
  const tokensB = dropTokens(distinctiveTokens(b.title), drop);
  if (tokensA.size === 0 && tokensB.size === 0) {
    return { jaccard: 0, intersection: 0, corroborates: false };
  }
  let intersection = 0;
  for (const t of tokensA) if (tokensB.has(t)) intersection += 1;
  const union = tokensA.size + tokensB.size - intersection;
  const jaccard = union === 0 ? 0 : intersection / union;
  const corroborates = intersection >= 2 && jaccard >= 0.34;
  return { jaccard, intersection, corroborates };
}

export type MatchKind = "exact" | "corroborated" | null;

export type PairDecision = {
  matched: boolean;
  kind: MatchKind;
  visual: VisualKind;
  distances: VisualDistances | null;
  title: TitleScore;
  /** Why a pair was rejected — useful in tests and for future admin debug. */
  rejectedBy:
    | "fingerprint"
    | "product_type"
    | "character"
    | "brand"
    | "title"
    | "visual"
    | null;
};

/**
 * Decide whether two products are the same listing photographed twice.
 *
 * Precision over recall: the admin UI deletes from these groups, so a missed
 * re-upload is cheaper than merging fifty unrelated pastel cases.
 */
export function decidePair(
  fingerprintsA: readonly string[],
  fingerprintsB: readonly string[],
  identityA: DuplicateIdentity,
  identityB: DuplicateIdentity,
): PairDecision {
  const title = scoreTitle(identityA, identityB);
  const empty: PairDecision = {
    matched: false,
    kind: null,
    visual: "none",
    distances: null,
    title,
    rejectedBy: "fingerprint",
  };

  const best = bestVisual(fingerprintsA, fingerprintsB);
  if (!best) return empty;

  const visual = classifyVisual(best);
  const base = {
    visual,
    distances: best,
    title,
  };

  if (visual === "none") {
    return { ...base, matched: false, kind: null, rejectedBy: "visual" };
  }

  if (typesConflict(identityA.productType, identityB.productType)) {
    return { ...base, matched: false, kind: null, rejectedBy: "product_type" };
  }

  // Shared MagSafe / strap / pack-shot photos are byte-identical across
  // listings. Identity has to gate even an exact visual or those extras
  // collapse the catalogue into false "identical" pairs.
  if (namesConflict(identityA.characterName, identityB.characterName)) {
    return { ...base, matched: false, kind: null, rejectedBy: "character" };
  }
  if (namesConflict(identityA.brandName, identityB.brandName)) {
    return { ...base, matched: false, kind: null, rejectedBy: "brand" };
  }

  if (visual === "exact") {
    return { ...base, matched: true, kind: "exact", rejectedBy: null };
  }

  if (!title.corroborates) {
    return { ...base, matched: false, kind: null, rejectedBy: "title" };
  }
  return { ...base, matched: true, kind: "corroborated", rejectedBy: null };
}

export function pairConfidence(kind: MatchKind): DuplicateConfidence | null {
  if (kind === "exact") return "identical";
  if (kind === "corroborated") return "very_likely";
  return null;
}

/**
 * Complete-linkage clustering: a vertex joins a cluster only if it matches
 * *every* current member. Equivalent to requiring cluster diameter ≤ the
 * match predicate, which is what kills hash-chaining.
 *
 * Greedy in index order so the result is deterministic.
 */
export function completeLinkageClusters(
  n: number,
  related: (i: number, j: number) => boolean,
): number[][] {
  if (n < 2) return [];
  const unused = new Set<number>();
  for (let i = 0; i < n; i++) unused.add(i);

  const clusters: number[][] = [];
  while (unused.size > 0) {
    const start = nextIndex(unused);
    unused.delete(start);
    const cluster = [start];
    for (;;) {
      let added: number | null = null;
      for (const i of sorted(unused)) {
        if (cluster.every((j) => related(i, j))) {
          added = i;
          break;
        }
      }
      if (added === null) break;
      unused.delete(added);
      cluster.push(added);
    }
    if (cluster.length >= 2) clusters.push(cluster);
  }
  return clusters;
}

export function confidenceForCluster(
  kinds: readonly MatchKind[],
): DuplicateConfidence {
  if (kinds.length === 0) return "possible";
  if (kinds.every((k) => k === "exact")) return "identical";
  if (kinds.every((k) => k === "exact" || k === "corroborated")) {
    return "very_likely";
  }
  return "possible";
}

// ── internals ────────────────────────────────────────────────────────────────

function bestVisual(
  hashesA: readonly string[],
  hashesB: readonly string[],
): VisualDistances | null {
  let best: VisualDistances | null = null;
  const parsedA: Fingerprint[] = [];
  for (const h of hashesA) {
    const fp = parseFingerprint(h);
    if (fp) parsedA.push(fp);
  }
  const parsedB: Fingerprint[] = [];
  for (const h of hashesB) {
    const fp = parseFingerprint(h);
    if (fp) parsedB.push(fp);
  }
  if (parsedA.length === 0 || parsedB.length === 0) return null;

  for (const a of parsedA) {
    for (const b of parsedB) {
      const d = visualDistances(a, b);
      if (!best || d.combined < best.combined) best = d;
    }
  }
  return best;
}

function typesConflict(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normName(a);
  const nb = normName(b);
  return !!na && !!nb && na !== nb;
}

function namesConflict(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normName(a);
  const nb = normName(b);
  return !!na && !!nb && na !== nb;
}

function normName(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = value.trim().toLowerCase();
  return t.length > 0 ? t : null;
}

function nameTokens(value: string | null | undefined): string[] {
  const n = normName(value);
  if (!n) return [];
  return n.split(/[^a-z0-9]+/).filter((p) => p.length >= 3);
}

function dropTokens(tokens: Set<string>, drop: Set<string>): Set<string> {
  if (drop.size === 0) return tokens;
  const out = new Set<string>();
  for (const t of tokens) if (!drop.has(t)) out.add(t);
  return out;
}

function nextIndex(unused: Set<number>): number {
  let min = Infinity;
  for (const i of unused) if (i < min) min = i;
  return min;
}

function sorted(unused: Set<number>): number[] {
  return [...unused].sort((a, b) => a - b);
}

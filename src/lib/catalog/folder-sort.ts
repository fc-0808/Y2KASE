/**
 * Pre-ingest folder classification — the receiving-dock step.
 *
 * QQ / WeChat supplier dumps arrive as a pile of product folders with Chinese
 * names, numeric SKUs, chat screenshots and mixed product types. Ingest already
 * classifies *while* uploading to R2 and writing Neon; that is the wrong moment
 * to find out a folder was a QR code. This module decides, purely, where each
 * discovered folder should live in the catalog tree *before* any paid copy
 * generation or object upload.
 *
 * Destination layout matches `catalog.config.json` / ingest convention:
 *
 *   <dest>/<Brand or type folder>/<original-leaf>/
 *   <dest>/Others/…          generic iPhone cases, no classifiable IP
 *   <dest>/_review/…         product, but not confident enough to file
 *   <dest>/_rejected/…       not a product (chat UI, QR, invoice, junk)
 *
 * Non-iPhone types pin the top-level folder (AirPods, WatchBands, …) so ingest
 * can apply the matching category rule. iPhone cases file by brand.
 *
 * No filesystem I/O lives here — the CLI applies the plan. That keeps the
 * decision table in the guard suite.
 */
import {
  EMPTY_BRAND_CLASSIFICATION,
  type BrandClassification,
  type BrandConfidence,
} from "@/lib/catalog/brands";
import { taxonomySlugChain } from "@/lib/catalog/collections-config";
import { getProductType } from "@/lib/catalog/product-types";

export const FOLDER_SORT_VERSION = 1 as const;

/** Sentinel top-level folders the sorter owns. Never treated as brands. */
export const REVIEW_FOLDER = "_review";
export const REJECTED_FOLDER = "_rejected";
export const UNCLASSIFIED_FOLDER = "Others";

export type FolderSortAction = "file" | "review" | "reject";

export const REJECT_REASONS = [
  "chat_screenshot",
  "qr_code",
  "invoice",
  "size_chart",
  "unrelated",
  "too_messy",
] as const;

export type RejectReason = (typeof REJECT_REASONS)[number];

/**
 * Top-level destination for a non-iPhone product type. Keys are product-type
 * ids; values are the folder names `catalog.config.json` already uses.
 * iPhone cases are omitted — they file by brand instead.
 */
export const TYPE_DESTINATION: Record<string, string> = {
  samsung_case: "Samsung",
  pixel_case: "Pixel",
  airpod_case: "AirPods",
  ipad_case: "iPad",
  macbook_case: "MacBook",
  kindle_case: "Kindle",
  watch_band: "WatchBands",
  apple_accessory: "Accessories",
};

const CONFIDENCE_RANK: Record<BrandConfidence, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

/** Auto-file at medium or higher — same bar ingest uses to trust vision. */
export const AUTO_FILE_MIN_CONFIDENCE: BrandConfidence = "medium";

export type IncomingFolderVerdict = {
  /** False when the photos are chat UI, a QR code, an invoice, etc. */
  isProduct: boolean;
  rejectReason: RejectReason | null;
  /** Always a known product-type id; defaults to iphone_case. */
  productTypeId: string;
  brand: BrandClassification;
  /**
   * Overall confidence in the *folder* decision (type + identity together).
   * A generic floral case with no IP and a clear product type is "high".
   */
  confidence: BrandConfidence;
  evidence: string[];
  /** Vision call failed. Callers must fail closed to review, never reject. */
  failed: boolean;
};

export type FolderSortPlan = {
  action: FolderSortAction;
  /**
   * Destination relative to the catalog root, using `/` separators
   * (e.g. `Sanrio/凯蒂猫001`, `_review/foo`).
   */
  destRelative: string;
  /** Top-level segment of destRelative. */
  destCategory: string;
  productTypeId: string;
  brand: BrandClassification;
  /** Browse-tree slugs to pin on listing.json (character + ancestors). */
  collections: string[];
  confidence: BrandConfidence;
  reason: string;
};

export type ClassificationRecord = {
  version: typeof FOLDER_SORT_VERSION;
  model: string;
  action: FolderSortAction;
  confidence: BrandConfidence;
  brand: string | null;
  character: string | null;
  brandId: string | null;
  characterId: string | null;
  productType: string;
  isProduct: boolean;
  rejectReason: RejectReason | null;
  evidence: string[];
  imageHashes: string[];
  at: string;
};

const WINDOWS_RESERVED = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

/**
 * Keep supplier folder names (including Chinese) so the original identity is
 * recoverable. Only strip characters Windows / ZIP / R2 cannot store.
 */
export function sanitizeFolderSegment(name: string): string {
  const stripped = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();
  const fallback = stripped || "product";
  return WINDOWS_RESERVED.has(fallback.toLowerCase())
    ? `${fallback}_`
    : fallback.slice(0, 120);
}

export function coerceRejectReason(value: unknown): RejectReason | null {
  return REJECT_REASONS.includes(value as RejectReason)
    ? (value as RejectReason)
    : null;
}

export function collectionsForClassification(
  brandId: string | null,
  characterId: string | null,
): string[] {
  const slugs = new Set<string>();
  if (characterId) {
    for (const slug of taxonomySlugChain(characterId)) slugs.add(slug);
  }
  if (brandId) {
    for (const slug of taxonomySlugChain(brandId)) slugs.add(slug);
  }
  return [...slugs];
}

/**
 * Decide file / review / reject. Fail closed:
 *   vision outage or low confidence → review
 *   confidently not a product, with a recognized reason → reject
 *   medium/high → file
 *
 * A generic product with no brand and high confidence still files (into
 * Others). Guessing a brand at low confidence is what puts a Stitch case
 * under Hello Kitty, so that path never auto-files.
 */
export function decideSortAction(
  verdict: Pick<
    IncomingFolderVerdict,
    "isProduct" | "rejectReason" | "confidence" | "failed"
  >,
): FolderSortAction {
  if (verdict.failed) return "review";
  const confident =
    CONFIDENCE_RANK[verdict.confidence] >=
    CONFIDENCE_RANK[AUTO_FILE_MIN_CONFIDENCE];
  if (!verdict.isProduct) {
    return verdict.rejectReason && confident ? "reject" : "review";
  }
  return confident
    ? "file"
    : "review";
}

export function destCategoryFor(
  action: FolderSortAction,
  productTypeId: string,
  brandName: string | null,
): string {
  if (action === "reject") return REJECTED_FOLDER;
  if (action === "review") return REVIEW_FOLDER;
  const typeFolder = TYPE_DESTINATION[productTypeId];
  if (typeFolder) return typeFolder;
  if (brandName) return sanitizeFolderSegment(brandName);
  return UNCLASSIFIED_FOLDER;
}

export function destRelativeFor(
  category: string,
  leaf: string,
): string {
  return `${category}/${sanitizeFolderSegment(leaf)}`;
}

/**
 * Pick a leaf that does not collide with names already present in the
 * destination category. `__2` rather than `-2` so a real SKU ending in -2
 * is not mistaken for a collision suffix.
 */
export function uniqueDestLeaf(
  desired: string,
  existingLeaves: ReadonlySet<string>,
): string {
  const base = sanitizeFolderSegment(desired);
  if (!existingLeaves.has(base.toLowerCase())) return base;
  for (let n = 2; n < 500; n++) {
    const candidate = `${base}__${n}`.slice(0, 120);
    if (!existingLeaves.has(candidate.toLowerCase())) return candidate;
  }
  return `${base}__${Date.now()}`;
}

export function planFolderSort(input: {
  verdict: IncomingFolderVerdict;
  /** Basename of the source product folder (may be Chinese). */
  sourceLeaf: string;
  /** Existing basenames in the chosen destination category (lowercase). */
  existingLeaves?: ReadonlySet<string>;
}): FolderSortPlan {
  const { verdict, sourceLeaf } = input;
  const action = decideSortAction(verdict);
  const productTypeId = getProductType(verdict.productTypeId).id;
  const destCategory = destCategoryFor(
    action,
    productTypeId,
    verdict.brand.brand,
  );
  const leaf = uniqueDestLeaf(
    sourceLeaf,
    input.existingLeaves ?? new Set(),
  );
  const destRelative = destRelativeFor(destCategory, leaf);

  const reason = sortReason(action, verdict);

  return {
    action,
    destRelative,
    destCategory,
    productTypeId,
    brand: verdict.brand,
    collections: collectionsForClassification(
      verdict.brand.brandId,
      verdict.brand.characterId,
    ),
    confidence: verdict.confidence,
    reason,
  };
}

function sortReason(
  action: FolderSortAction,
  verdict: IncomingFolderVerdict,
): string {
  if (action === "reject") {
    return verdict.rejectReason
      ? `Not a product (${verdict.rejectReason}).`
      : "Not a product.";
  }
  if (action === "review") {
    if (verdict.failed) return "Vision classifier unavailable — queued for review.";
    return `Confidence ${verdict.confidence} — queued for review.`;
  }
  const ip = verdict.brand.character ?? verdict.brand.brand;
  const type = getProductType(verdict.productTypeId).id;
  return ip
    ? `Filed as ${ip} ${type} (${verdict.confidence}).`
    : `Filed as unclassified ${type} (${verdict.confidence}).`;
}

/**
 * Merge a classification into an existing listing.json object without wiping
 * human-pinned fields. productType / collections are filled only where the
 * operator has not already set them; `_classification` is always rewritten.
 */
export function mergeClassificationIntoListing(
  existing: Record<string, unknown> | null,
  plan: FolderSortPlan,
  record: ClassificationRecord,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(existing ?? {}) };

  const pinnedType =
    typeof out.productType === "string" && out.productType.trim()
      ? out.productType.trim()
      : null;
  if (!pinnedType && plan.action !== "reject") {
    out.productType = plan.productTypeId;
  }

  const existingCollections = Array.isArray(out.collections)
    ? out.collections.filter((s): s is string => typeof s === "string" && s.length > 0)
    : [];
  const collections = Array.from(
    new Set([...existingCollections, ...plan.collections]),
  );
  if (collections.length > 0) out.collections = collections;

  out._classification = record;
  return out;
}

export function parseClassificationRecord(
  raw: unknown,
): ClassificationRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== FOLDER_SORT_VERSION) return null;
  if (typeof o.model !== "string" || typeof o.at !== "string") return null;
  if (o.action !== "file" && o.action !== "review" && o.action !== "reject") {
    return null;
  }
  const hashes = Array.isArray(o.imageHashes)
    ? o.imageHashes.filter((h): h is string => typeof h === "string")
    : [];
  return {
    version: FOLDER_SORT_VERSION,
    model: o.model,
    action: o.action,
    confidence: coerceConfidence(o.confidence),
    brand: typeof o.brand === "string" ? o.brand : null,
    character: typeof o.character === "string" ? o.character : null,
    brandId: typeof o.brandId === "string" ? o.brandId : null,
    characterId: typeof o.characterId === "string" ? o.characterId : null,
    productType: typeof o.productType === "string" ? o.productType : "iphone_case",
    isProduct: o.isProduct === true,
    rejectReason: coerceRejectReason(o.rejectReason),
    evidence: Array.isArray(o.evidence)
      ? o.evidence.filter((e): e is string => typeof e === "string").slice(0, 8)
      : [],
    imageHashes: hashes,
    at: o.at,
  };
}

function coerceConfidence(value: unknown): BrandConfidence {
  const allowed: BrandConfidence[] = ["high", "medium", "low", "none"];
  return allowed.includes(value as BrandConfidence)
    ? (value as BrandConfidence)
    : "none";
}

export function hashesMatch(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * True when this folder was already classified against the same photos and
 * already sits at the planned destination — a no-op on re-run.
 */
export function isUnchangedClassification(
  previous: ClassificationRecord | null,
  imageHashes: readonly string[],
  currentRelative: string,
  plannedRelative: string,
): boolean {
  if (!previous) return false;
  return (
    hashesMatch(previous.imageHashes, imageHashes) &&
    normalizeRel(currentRelative) === normalizeRel(plannedRelative)
  );
}

function normalizeRel(rel: string): string {
  return rel.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase();
}

export function buildClassificationRecord(input: {
  model: string;
  plan: FolderSortPlan;
  verdict: IncomingFolderVerdict;
  imageHashes: string[];
  at?: string;
}): ClassificationRecord {
  return {
    version: FOLDER_SORT_VERSION,
    model: input.model,
    action: input.plan.action,
    confidence: input.verdict.confidence,
    brand: input.verdict.brand.brand,
    character: input.verdict.brand.character,
    brandId: input.verdict.brand.brandId,
    characterId: input.verdict.brand.characterId,
    productType: input.plan.productTypeId,
    isProduct: input.verdict.isProduct,
    rejectReason: input.verdict.rejectReason,
    evidence: input.verdict.evidence,
    imageHashes: input.imageHashes,
    at: input.at ?? new Date().toISOString(),
  };
}

export function emptyVerdict(): IncomingFolderVerdict {
  return {
    isProduct: true,
    rejectReason: null,
    productTypeId: "iphone_case",
    brand: EMPTY_BRAND_CLASSIFICATION,
    confidence: "none",
    evidence: [],
    failed: true,
  };
}

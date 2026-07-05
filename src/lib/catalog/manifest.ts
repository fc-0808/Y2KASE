/**
 * Catalog ingestion metadata — convention over configuration.
 *
 * The folder tree under `LOCAL_CATALOG_ROOT` (default `./bestListings`) is the
 * source of *assets*. Two optional JSON sidecars turn it into a real catalog
 * pipeline, the way a PIM (Akeneo / commercetools / Shopify Matrixify) would:
 *
 *   bestListings/
 *     catalog.config.json            ← catalog-level defaults + per-category rules
 *     Sanrio/                        ← category folder (top-level segment)
 *       hello-kitty-bow-case/        ← ONE product folder (slug or SKU as name)
 *         listing.json               ← optional per-product overrides
 *         1.jpg 2.mp4 3.png …        ← gallery media (numeric order preserved)
 *
 * Resolution precedence (highest wins):
 *   listing.json  →  catalog.config category rule  →  catalog.config default
 *   →  CLI/env fallback (`--type`, currency env).
 *
 * Everything is optional and backwards-compatible: with no sidecars at all the
 * pipeline behaves exactly as before (single product type, fully AI-authored
 * copy, draft status). The manifest only lets you make data *deterministic*
 * where you care, and lean on AI for the rest.
 */
import fs from "node:fs";
import path from "node:path";

export type ListingStatus = "draft" | "active";

/** Per-product overrides, read from `<productFolder>/listing.json`. */
export type ListingManifest = {
  /** Product type id (e.g. "iphone_case"). Overrides category/default. */
  productType?: string;
  /** Stable SKU — used for clean R2 keys and ingest tracking labels. */
  sku?: string;
  /** Pin the listing title (skips AI copy generation when description is set too). */
  title?: string;
  /** Pin the description. */
  description?: string;
  /** Override price in the listing currency. */
  price?: number;
  /** Override currency (ISO code). */
  currency?: string;
  /** Override materials string. */
  materials?: string;
  /** Search tags. Merged with auto/AI tags. */
  tags?: string[];
  /** Explicit collection slugs to force-add (merged with auto-classification). */
  collections?: string[];
  /** Publish state. Defaults to "draft" for human review. */
  status?: ListingStatus;
  /** Accessibility alt text for the primary image. */
  altText?: string;
};

/** Defaults applied to every product folder under a top-level category. */
export type CategoryRule = {
  productType?: string;
  collections?: string[];
  currency?: string;
  status?: ListingStatus;
  price?: number;
};

/** `catalog.config.json` at the catalog root. */
export type CatalogConfig = {
  defaultProductType?: string;
  defaultCurrency?: string;
  defaultStatus?: ListingStatus;
  /** Keyed by top-level category folder name (matched case-insensitively). */
  categories?: Record<string, CategoryRule>;
};

/** Fully resolved instructions for ingesting one product folder. */
export type ResolvedListing = {
  productTypeId: string;
  /**
   * True when the type was pinned by a manifest / category rule / catalog
   * default. False means it only fell back to the CLI/env type — the signal
   * the bulk pipeline uses to let AI auto-classify instead.
   */
  productTypeExplicit: boolean;
  currency: string;
  status: ListingStatus;
  /** Stable identity for R2 keys + tracking; falls back to the folder path. */
  sku?: string;
  price?: number;
  title?: string;
  description?: string;
  tags?: string[];
  materials?: string;
  altText?: string;
  /** Explicit collection slugs to force-add on top of auto-classification. */
  collections?: string[];
};

const CONFIG_FILENAME = "catalog.config.json";
const MANIFEST_FILENAMES = ["listing.json", "product.json"] as const;

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  return out.length > 0 ? out : undefined;
}

function asStatus(v: unknown): ListingStatus | undefined {
  return v === "draft" || v === "active" ? v : undefined;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function parseManifestObject(obj: Record<string, unknown>): ListingManifest {
  return {
    productType: asString(obj.productType),
    sku: asString(obj.sku),
    title: asString(obj.title),
    description: asString(obj.description),
    price: asNumber(obj.price),
    currency: asString(obj.currency),
    materials: asString(obj.materials),
    tags: asStringArray(obj.tags),
    collections: asStringArray(obj.collections),
    status: asStatus(obj.status),
    altText: asString(obj.altText),
  };
}

function parseCategoryRule(obj: Record<string, unknown>): CategoryRule {
  return {
    productType: asString(obj.productType),
    collections: asStringArray(obj.collections),
    currency: asString(obj.currency),
    status: asStatus(obj.status),
    price: asNumber(obj.price),
  };
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Load `catalog.config.json` from the catalog root (returns {} when absent). */
export function loadCatalogConfig(root: string): CatalogConfig {
  const file = path.join(path.resolve(root), CONFIG_FILENAME);
  const obj = readJson(file);
  if (!obj) return {};

  const categoriesRaw = obj.categories;
  const categories: Record<string, CategoryRule> = {};
  if (categoriesRaw && typeof categoriesRaw === "object") {
    for (const [key, value] of Object.entries(
      categoriesRaw as Record<string, unknown>,
    )) {
      if (value && typeof value === "object") {
        categories[key.toLowerCase()] = parseCategoryRule(
          value as Record<string, unknown>,
        );
      }
    }
  }

  return {
    defaultProductType: asString(obj.defaultProductType),
    defaultCurrency: asString(obj.defaultCurrency),
    defaultStatus: asStatus(obj.defaultStatus),
    categories,
  };
}

/**
 * Read a product folder's manifest. Returns the parsed manifest plus the raw
 * file contents (used by the ingest tracker to re-run when a manifest changes).
 */
export function readListingManifest(absFolder: string): {
  manifest: ListingManifest;
  raw: string | null;
} {
  for (const name of MANIFEST_FILENAMES) {
    const file = path.join(absFolder, name);
    let raw: string;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const obj = readJson(file);
    return { manifest: obj ? parseManifestObject(obj) : {}, raw };
  }
  return { manifest: {}, raw: null };
}

/** The top-level category segment of a relative folder path ("Sanrio/10" → "Sanrio"). */
export function topCategory(folderPath: string): string | null {
  const seg = folderPath.split("/").filter(Boolean)[0];
  return seg ?? null;
}

export type ResolveListingInput = {
  /** Relative folder path from the catalog root, e.g. "Sanrio/hello-kitty". */
  folderPath: string;
  /** Absolute path to the product folder (where listing.json lives). */
  absFolder: string;
  config: CatalogConfig;
  /** Fallback product type (CLI `--type` / env) when nothing else specifies one. */
  fallbackProductType: string;
  /** Fallback currency (env) when nothing else specifies one. */
  fallbackCurrency: string;
};

/**
 * Merge per-folder manifest, per-category rule and catalog defaults into a
 * single resolved instruction set, honouring the documented precedence.
 */
export function resolveListing(input: ResolveListingInput): {
  resolved: ResolvedListing;
  manifestRaw: string | null;
} {
  const {
    folderPath,
    absFolder,
    config,
    fallbackProductType,
    fallbackCurrency,
  } = input;
  const { manifest, raw } = readListingManifest(absFolder);

  const cat = topCategory(folderPath);
  const rule = (cat && config.categories?.[cat.toLowerCase()]) || {};

  const explicitProductType =
    manifest.productType ?? rule.productType ?? config.defaultProductType;
  const productTypeId = explicitProductType ?? fallbackProductType;

  const currency =
    manifest.currency ??
    rule.currency ??
    config.defaultCurrency ??
    fallbackCurrency;

  const status: ListingStatus =
    manifest.status ?? rule.status ?? config.defaultStatus ?? "draft";

  const price = manifest.price ?? rule.price;

  const collections = Array.from(
    new Set([...(rule.collections ?? []), ...(manifest.collections ?? [])]),
  );

  return {
    resolved: {
      productTypeId,
      productTypeExplicit: explicitProductType != null,
      currency,
      status,
      sku: manifest.sku,
      price,
      title: manifest.title,
      description: manifest.description,
      tags: manifest.tags,
      materials: manifest.materials,
      altText: manifest.altText,
      collections: collections.length > 0 ? collections : undefined,
    },
    manifestRaw: raw,
  };
}

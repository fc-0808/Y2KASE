import type { ProductTypeConfig, ProductTypeId, OptionAxis } from "../types";
import { axisByRole } from "../types";
import { iphoneCaseType } from "./iphone-case";
import {
  airpodCaseType,
  samsungCaseType,
  pixelCaseType,
  ipadCaseType,
  macbookCaseType,
  kindleCaseType,
  watchBandType,
  appleAccessoryType,
} from "./flat-types";

const REGISTRY: Record<ProductTypeId, ProductTypeConfig> = {
  iphone_case: iphoneCaseType,
  samsung_case: samsungCaseType,
  pixel_case: pixelCaseType,
  airpod_case: airpodCaseType,
  ipad_case: ipadCaseType,
  macbook_case: macbookCaseType,
  apple_accessory: appleAccessoryType,
  kindle_case: kindleCaseType,
  watch_band: watchBandType,
};

export function getProductType(id: string): ProductTypeConfig {
  const key = id as ProductTypeId;
  return REGISTRY[key] ?? REGISTRY.iphone_case;
}

/**
 * Map a free-text `category` returned by the vision model to one of our
 * product-type ids — the bridge that lets AI classify "what kind of product"
 * this is. Returns null when the category is unknown or maps to a type that
 * isn't enabled yet, so the caller can fall back to a default.
 */
const CATEGORY_TO_TYPE: Record<string, ProductTypeId> = {
  iphone_case: "iphone_case",
  phone_case: "iphone_case",
  samsung_case: "samsung_case",
  galaxy_case: "samsung_case",
  pixel_case: "pixel_case",
  airpod_case: "airpod_case",
  airpods_case: "airpod_case",
  ipad_case: "ipad_case",
  tablet_case: "ipad_case",
  macbook_case: "macbook_case",
  laptop_case: "macbook_case",
  kindle_case: "kindle_case",
  ereader_case: "kindle_case",
  watch_band: "watch_band",
  watch_strap: "watch_band",
  apple_accessory: "apple_accessory",
  accessory: "apple_accessory",
  phone_charm: "apple_accessory",
  charm: "apple_accessory",
};

export function inferProductTypeId(
  category: string | null | undefined,
): ProductTypeId | null {
  if (!category) return null;
  const key = category
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
  const id = CATEGORY_TO_TYPE[key];
  return id && REGISTRY[id].enabled ? id : null;
}

/** Human label for a product type id, safe for unknown ids. */
export function productTypeLabel(id: string): string {
  return (REGISTRY[id as ProductTypeId] ?? REGISTRY.iphone_case).label;
}

export function listProductTypes(): ProductTypeConfig[] {
  return Object.values(REGISTRY);
}

export function listEnabledProductTypes(): ProductTypeConfig[] {
  return listProductTypes().filter((t) => t.enabled);
}

// ── Role accessors — let callers stay axis-name agnostic ─────────────────────

/** The price-driving axis for a type (e.g. "Style" for iPhone cases). */
export function priceAxisFor(id: string): OptionAxis | undefined {
  return axisByRole(getProductType(id), "price");
}

/** The device-fit axis for a type (e.g. "iPhone Model"). */
export function compatibilityAxisFor(id: string): OptionAxis | undefined {
  return axisByRole(getProductType(id), "compatibility");
}

/** The axis name used for per-image tagging, if the type supports it. */
export function mediaTagAxisFor(id: string): string | undefined {
  return getProductType(id).mediaTagAxis;
}

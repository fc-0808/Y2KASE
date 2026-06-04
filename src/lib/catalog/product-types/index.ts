import type {
  ProductTypeConfig,
  ProductTypeId,
  OptionAxis,
} from "../types";
import { axisByRole } from "../types";
import { iphoneCaseType } from "./iphone-case";

const REGISTRY: Record<ProductTypeId, ProductTypeConfig> = {
  iphone_case: iphoneCaseType,
  samsung_case: {
    id: "samsung_case",
    label: "Samsung Case",
    description: "Galaxy phone cases — options TBD.",
    enabled: false,
    noun: "Case",
    options: [],
    getBasePrice: () => 0,
    getPriceFromOptions: () => 0,
  },
  pixel_case: {
    id: "pixel_case",
    label: "Pixel Case",
    description: "Google Pixel phone cases — options TBD.",
    enabled: false,
    noun: "Case",
    options: [],
    getBasePrice: () => 0,
    getPriceFromOptions: () => 0,
  },
  airpod_case: {
    id: "airpod_case",
    label: "AirPods Case",
    description: "AirPods / AirPods Pro cases — options TBD.",
    enabled: false,
    noun: "Case",
    options: [],
    getBasePrice: () => 0,
    getPriceFromOptions: () => 0,
  },
  ipad_case: {
    id: "ipad_case",
    label: "iPad Case",
    description: "iPad covers / folios — options TBD.",
    enabled: false,
    noun: "Case",
    options: [],
    getBasePrice: () => 0,
    getPriceFromOptions: () => 0,
  },
  macbook_case: {
    id: "macbook_case",
    label: "MacBook Case",
    description: "MacBook hard shells / sleeves — options TBD.",
    enabled: false,
    noun: "Case",
    options: [],
    getBasePrice: () => 0,
    getPriceFromOptions: () => 0,
  },
  apple_accessory: {
    id: "apple_accessory",
    label: "Apple Accessory",
    description: "AirTag holders, chargers and other Apple accessories — options TBD.",
    enabled: false,
    noun: "Accessory",
    options: [],
    getBasePrice: () => 0,
    getPriceFromOptions: () => 0,
  },
  kindle_case: {
    id: "kindle_case",
    label: "Kindle Case",
    description: "Kindle sleeves / cases — options TBD.",
    enabled: false,
    noun: "Case",
    options: [],
    getBasePrice: () => 0,
    getPriceFromOptions: () => 0,
  },
  watch_band: {
    id: "watch_band",
    label: "Apple Watch Band",
    description: "Apple Watch bands — options TBD.",
    enabled: false,
    noun: "Band",
    options: [],
    getBasePrice: () => 0,
    getPriceFromOptions: () => 0,
  },
};

export function getProductType(id: string): ProductTypeConfig {
  const key = id as ProductTypeId;
  return REGISTRY[key] ?? REGISTRY.iphone_case;
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

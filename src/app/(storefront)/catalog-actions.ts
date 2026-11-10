"use server";

import { isShopSlug } from "@/lib/catalog/browse-affinity";
import { deviceOfProductType } from "@/lib/catalog/devices";
import {
  getCharacterDeviceProducts,
  getProducts,
  type ProductListItem,
  type ProductQuery,
} from "@/lib/products";

/**
 * The next window of a catalog the shopper is already viewing.
 * Facet counts stay on the first response — this is only the cards.
 */
export async function loadCatalogSlice(query: ProductQuery): Promise<{
  items: ProductListItem[];
  total: number;
  pageSize: number;
}> {
  const page = await getProducts(query);
  return { items: page.items, total: page.total, pageSize: page.pageSize };
}

/**
 * Cases of one character for the device the shopper is looking at.
 * The device id is the mould boundary: a numbered iPhone page never receives
 * iPhone Duo, and the reverse is also true. Unknown slugs and types return
 * nothing so the rail keeps its server list.
 */
export async function loadCharacterCases(input: {
  characterSlug: string;
  productType: string;
}): Promise<ProductListItem[]> {
  if (
    !input ||
    typeof input.characterSlug !== "string" ||
    typeof input.productType !== "string" ||
    !isShopSlug(input.characterSlug)
  ) {
    return [];
  }
  const device = deviceOfProductType(input.productType);
  if (!device) return [];
  try {
    return await getCharacterDeviceProducts(input.characterSlug, device.id);
  } catch (error) {
    console.error("[related-rail] character cases unavailable:", error);
    return [];
  }
}

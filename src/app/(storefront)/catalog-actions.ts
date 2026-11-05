"use server";

import { getProducts, type ProductListItem, type ProductQuery } from "@/lib/products";

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

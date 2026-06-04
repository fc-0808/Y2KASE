"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import {
  saveProductVariations,
  type SaveVariationsResult,
} from "@/lib/admin/product-variations";

export type SaveProductPayload = {
  productId: number;
  /** Image ids in their new display order (top → bottom). */
  imageOrder: number[];
  /** 0-based slot the video occupies among the images. Null = no video slot. */
  videoSlot: number | null;
  /** imageId → applicable styles. `[]` means universal (shown for every style). */
  styleTags: Record<number, string[]>;
  /** The styles this product offers (drives the Style option + price). */
  availableStyles: string[];
  /** The iPhone models this product is sold for (optional; omit to keep). */
  availableModels?: string[];
};

export type SaveResult = SaveVariationsResult;

/**
 * Persist a curated media order, per-image style tags, the video slot and the
 * product's available styles/models in one shot. The heavy lifting lives in
 * the shared {@link saveProductVariations} core so this path stays identical
 * to the bulk editor.
 */
export async function saveProduct(
  payload: SaveProductPayload,
): Promise<SaveResult> {
  const session = await requireAdmin(await headers());
  if (!session) return { ok: false, message: "Not authorized." };

  const result = await saveProductVariations(payload);

  revalidatePath(`/admin/products/${payload.productId}`);
  revalidatePath("/admin/products");
  revalidatePath("/products");
  // The PDP is ISR-cached (`export const revalidate`). Without invalidating the
  // dynamic route, edited media order / style tags stay stale for up to an hour.
  revalidatePath("/products/[slug]", "page");
  revalidatePath("/");

  return result;
}

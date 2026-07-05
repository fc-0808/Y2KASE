"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { revalidateStorefrontCatalog } from "@/lib/cache";

function revalidateBestsellers() {
  revalidatePath("/admin/bestsellers");
  revalidatePath("/");
  // Drop the cached homepage "Bestsellers" data so the rail updates at once.
  revalidateStorefrontCatalog();
}

/**
 * Persist the curated order of the Bestsellers rail. `orderedIds` is the full
 * featured set in the exact order the operator arranged.
 */
export async function reorderBestsellers(
  orderedIds: number[],
): Promise<{ ok: boolean; message: string }> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized." };
  }
  const ids = orderedIds.filter((n) => Number.isFinite(n));
  for (let i = 0; i < ids.length; i++) {
    await db
      .update(products)
      .set({ featuredPosition: i, updatedAt: new Date() })
      .where(eq(products.id, ids[i]));
  }
  revalidateBestsellers();
  return { ok: true, message: "Bestseller order saved." };
}

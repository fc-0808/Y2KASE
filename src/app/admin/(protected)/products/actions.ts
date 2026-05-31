"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";

export async function publishProduct(id: number) {
  await db
    .update(products)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(products.id, id));
  revalidatePath("/admin/products");
  revalidatePath("/products");
  revalidatePath("/");
}

export async function unpublishProduct(id: number) {
  await db
    .update(products)
    .set({ status: "draft", updatedAt: new Date() })
    .where(eq(products.id, id));
  revalidatePath("/admin/products");
  revalidatePath("/products");
}

export async function setFeatured(id: number, featured: boolean) {
  await db
    .update(products)
    .set({ featured, updatedAt: new Date() })
    .where(eq(products.id, id));
  revalidatePath("/admin/products");
  revalidatePath("/");
}

export async function deleteProduct(id: number) {
  await db.delete(products).where(eq(products.id, id));
  revalidatePath("/admin/products");
  revalidatePath("/products");
}

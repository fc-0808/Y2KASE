"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { ORDER_STATUSES } from "@/lib/admin/orders";

export type OrderActionResult = { ok: boolean; message: string };

const VALID_STATUSES = new Set<string>(ORDER_STATUSES);

/** Update an order's fulfillment status. Admin-guarded. */
export async function updateOrderStatus(
  orderId: number,
  status: string,
): Promise<OrderActionResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized." };
  }
  if (!Number.isFinite(orderId) || !VALID_STATUSES.has(status)) {
    return { ok: false, message: "Invalid request." };
  }

  await db
    .update(orders)
    .set({ status, updatedAt: new Date() })
    .where(eq(orders.id, orderId));

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true, message: `Order marked ${status}.` };
}

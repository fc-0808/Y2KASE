"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { ORDER_STATUSES } from "@/lib/admin/orders";
import { sendShipmentNotificationOnce } from "@/lib/email";

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

/**
 * Mark an order shipped: persist tracking info, flip status to "shipped", and
 * fire the (exactly-once) shipment-notification email. Admin-guarded.
 */
export async function markShipped(
  orderId: number,
  input: { carrier?: string; trackingNumber?: string; trackingUrl?: string },
): Promise<OrderActionResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized." };
  }
  if (!Number.isFinite(orderId)) {
    return { ok: false, message: "Invalid request." };
  }

  const carrier = input.carrier?.trim() || null;
  const trackingNumber = input.trackingNumber?.trim() || null;
  const trackingUrl = input.trackingUrl?.trim() || null;

  await db
    .update(orders)
    .set({
      status: "shipped",
      carrier,
      trackingNumber,
      trackingUrl,
      shippedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  // Best-effort customer notification — a mail failure must not fail the action.
  const emailResult = await sendShipmentNotificationOnce(orderId);

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  return {
    ok: true,
    message:
      emailResult === "sent"
        ? "Order marked shipped — customer notified."
        : `Order marked shipped (email: ${emailResult}).`,
  };
}

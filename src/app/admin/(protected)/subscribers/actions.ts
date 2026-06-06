"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailSubscribers } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";

export type SubscriberActionResult = { ok: boolean; message: string };

/**
 * Toggle a subscriber between active and unsubscribed. We never hard-delete —
 * keeping an unsubscribe record is required to honour suppression lists
 * (CAN-SPAM / GDPR) so we don't accidentally re-email an opted-out address.
 */
export async function setSubscriberStatus(
  id: number,
  status: "active" | "unsubscribed",
): Promise<SubscriberActionResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized." };
  }
  if (!Number.isFinite(id) || (status !== "active" && status !== "unsubscribed")) {
    return { ok: false, message: "Invalid request." };
  }

  await db
    .update(emailSubscribers)
    .set({
      status,
      unsubscribedAt: status === "unsubscribed" ? new Date() : null,
    })
    .where(eq(emailSubscribers.id, id));

  revalidatePath("/admin/subscribers");
  return {
    ok: true,
    message: status === "active" ? "Subscriber reactivated." : "Subscriber unsubscribed.",
  };
}

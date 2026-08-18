"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailSubscribers } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { preserveHardSuppressionReason } from "@/lib/marketing/consent";
import { syncSubscriberToResend } from "@/lib/marketing/resend";

export type SubscriberActionResult = { ok: boolean; message: string };

/**
 * Administratively unsubscribe a recipient. We never hard-delete and we never
 * offer an admin-side reactivation: only a fresh customer submission through
 * /api/subscribe is valid evidence of renewed marketing consent.
 */
export async function unsubscribeSubscriber(
  id: number,
): Promise<SubscriberActionResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized." };
  }
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, message: "Invalid request." };
  }

  const [updated] = await db
    .update(emailSubscribers)
    .set({
      status: "unsubscribed",
      unsubscribedAt: new Date(),
      unsubscribeReason: preserveHardSuppressionReason("admin"),
    })
    .where(eq(emailSubscribers.id, id))
    .returning({
      email: emailSubscribers.email,
      name: emailSubscribers.name,
    });

  if (!updated) return { ok: false, message: "Subscriber not found." };

  const provider = await syncSubscriberToResend({
    email: updated.email,
    name: updated.name,
    status: "unsubscribed",
  });

  revalidatePath("/admin/subscribers");
  return {
    ok: true,
    message: provider.ok
      ? "Subscriber unsubscribed."
      : "Subscriber unsubscribed locally; Resend sync will retry before the next campaign.",
  };
}

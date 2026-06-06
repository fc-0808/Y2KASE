"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";

export type MemberActionResult = { ok: boolean; message: string };

const ASSIGNABLE_ROLES = new Set(["admin", "customer"]);

/**
 * Promote or demote a member. Admin-guarded (defense-in-depth — never trust the
 * layout/proxy alone). An admin cannot change their own role, which prevents a
 * sole admin from accidentally locking themselves out of the console.
 */
export async function setUserRole(
  userId: string,
  role: string,
): Promise<MemberActionResult> {
  const session = await requireAdmin(await headers());
  if (!session) return { ok: false, message: "Not authorized." };

  if (!ASSIGNABLE_ROLES.has(role)) {
    return { ok: false, message: "Invalid role." };
  }
  if (userId === session.user.id) {
    return { ok: false, message: "You can't change your own role." };
  }

  await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, userId));

  revalidatePath("/admin/members");
  return {
    ok: true,
    message: role === "admin" ? "Member promoted to admin." : "Admin access revoked.",
  };
}

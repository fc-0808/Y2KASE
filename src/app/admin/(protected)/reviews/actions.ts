"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { setReviewStatus, REVIEW_STATUSES, type ReviewStatus } from "@/lib/reviews";

export type ReviewActionResult = { ok: boolean; message: string };

const VALID = new Set<string>(REVIEW_STATUSES);

/** Approve / reject / re-queue a review. Admin-guarded. */
export async function moderateReview(
  id: number,
  status: string,
): Promise<ReviewActionResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized." };
  }
  if (!Number.isFinite(id) || !VALID.has(status)) {
    return { ok: false, message: "Invalid request." };
  }

  await setReviewStatus(id, status as ReviewStatus);
  revalidatePath("/admin/reviews");
  return { ok: true, message: `Review ${status}.` };
}

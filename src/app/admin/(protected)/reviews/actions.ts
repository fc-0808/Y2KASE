"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { revalidateReviewSurfaces, revalidateStorefrontProduct } from "@/lib/cache";
import {
  setMerchantReply,
  setReviewStatus,
  getReviewProductRef,
  REVIEW_STATUSES,
  type ReviewStatus,
} from "@/lib/reviews";

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
  const ref = await getReviewProductRef(id);
  if (ref) revalidateStorefrontProduct(ref.slug);
  revalidateReviewSurfaces();
  return { ok: true, message: `Review ${status}.` };
}

/** Public shop reply under a review. Empty text removes it. */
export async function saveMerchantReply(
  id: number,
  reply: string,
): Promise<ReviewActionResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized." };
  }
  if (!Number.isFinite(id) || reply.length > 2000) {
    return { ok: false, message: "Invalid request." };
  }
  await setMerchantReply(id, reply);
  revalidatePath("/admin/reviews");
  const ref = await getReviewProductRef(id);
  if (ref) revalidateStorefrontProduct(ref.slug);
  revalidateReviewSurfaces();
  return { ok: true, message: reply.trim() ? "Reply saved." : "Reply removed." };
}

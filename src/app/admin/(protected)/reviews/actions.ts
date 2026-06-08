"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { revalidateStorefrontCatalog } from "@/lib/cache";
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
  // Publishing/unpublishing a review changes the star summaries baked into
  // cached product cards (homepage + listings); drop those cache entries.
  revalidatePath("/products/[slug]", "page");
  revalidatePath("/products");
  revalidatePath("/");
  revalidateStorefrontCatalog();
  return { ok: true, message: `Review ${status}.` };
}

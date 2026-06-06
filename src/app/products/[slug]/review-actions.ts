"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { hit } from "@/lib/rate-limit";
import { submitReview, type SubmitReviewResult } from "@/lib/reviews";

export type { SubmitReviewResult };

/**
 * Public "write a review" action. Rate-limited by IP, attributed to the signed-
 * in user when present. Verified-purchase reviews auto-publish (and we
 * revalidate the PDP so they appear immediately); others go to moderation.
 */
export async function submitReviewAction(input: {
  productId: number;
  slug: string;
  authorName: string;
  authorEmail?: string;
  rating: number;
  title?: string;
  body: string;
}): Promise<SubmitReviewResult> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
  if (!hit(`review:${ip}`, { limit: 5, windowMs: 60 * 60 * 1000 }).ok) {
    return { ok: false, error: "You're reviewing too fast — try again later." };
  }

  let userId: string | null = null;
  let sessionEmail: string | undefined;
  try {
    const session = await getSession(h);
    userId = session?.user?.id ?? null;
    sessionEmail = session?.user?.email ?? undefined;
  } catch {
    userId = null;
  }

  const result = await submitReview({
    productId: input.productId,
    authorName: input.authorName,
    authorEmail: input.authorEmail || sessionEmail,
    rating: input.rating,
    title: input.title,
    body: input.body,
    userId,
  });

  if (result.ok && result.status === "published") {
    revalidatePath(`/products/${input.slug}`);
  }
  return result;
}

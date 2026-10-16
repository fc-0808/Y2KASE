import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { thumbnailProposals } from "@/lib/db/schema";

/**
 * Gallery image the approved cleaned thumbnail was cut from.
 *
 * That thumbnail is the isolated product shot. Its source image carries the
 * style it depicts, so the mobile confirmation row can show the cleaned shot
 * for that style and no other.
 */
export async function approvedThumbnailSourceImageId(
  productId: number,
): Promise<number | null> {
  try {
    const row = await db.query.thumbnailProposals.findFirst({
      where: eq(thumbnailProposals.productId, productId),
      columns: { sourceImageId: true, status: true },
    });
    if (!row || row.status !== "approved") return null;
    return row.sourceImageId ?? null;
  } catch (error) {
    console.error("[product-page] isolated look unavailable:", error);
    return null;
  }
}

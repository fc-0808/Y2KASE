"use server";

/**
 * Server Actions for the duplicate-review console.
 *
 * A `"use server"` module may only export async functions — Next.js turns every
 * export into a callable server reference, so exporting a type (even a
 * type-only re-export) produces a runtime `ReferenceError` when the action
 * module is evaluated. Shared shapes live in `@/lib/catalog/phash-types`.
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { backfillMissingPhashes } from "@/lib/catalog/phash-backfill";
import {
  PHASH_BACKFILL_BATCH_SIZE,
  type PhashScanResult,
} from "@/lib/catalog/phash-types";

const NO_PROGRESS = { hashed: 0, failed: 0, remaining: 0 } as const;

/**
 * Fingerprint the next batch of unhashed images. The client loops this until
 * `remaining === 0` (same pattern as the thumbnail "Generate all" flow) so a
 * full-catalogue scan stays within the serverless time budget.
 *
 * Takes no arguments on purpose: the batch size is a server-owned tunable, not
 * something a caller can inflate into a long-running request.
 */
export async function scanPhashBatch(): Promise<PhashScanResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized.", ...NO_PROGRESS };
  }

  try {
    const result = await backfillMissingPhashes(PHASH_BACKFILL_BATCH_SIZE);

    // Only bust the cache when the cluster report could actually change.
    if (result.hashed > 0) revalidatePath("/admin/products/duplicates");

    const parts = [
      result.hashed > 0 ? `Hashed ${result.hashed}` : null,
      result.failed > 0 ? `${result.failed} failed` : null,
      result.remaining > 0 ? `${result.remaining} left` : "catalogue scanned",
    ].filter(Boolean);

    return { ok: true, message: parts.join(" · "), ...result };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Scan failed.",
      ...NO_PROGRESS,
    };
  }
}

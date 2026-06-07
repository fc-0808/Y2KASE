"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { makeR2Client, deleteObjectsFromR2, r2KeyFromUrl } from "@/lib/catalog/r2";
import { isImageGenConfigured } from "@/lib/social/image-gen";
import { getPreset } from "@/lib/social/presets";
import { runGeneration } from "@/lib/social/generate";
import {
  setCreativeStatus,
  deleteCreative,
  updateCreativeCopy,
  getCreativeById,
  scheduleCreative,
  CREATIVE_STATUSES,
  type CreativeStatus,
} from "@/lib/social/creatives";
import { enqueueJobs, clearFinishedJobs } from "@/lib/social/jobs";
import { drainQueue } from "@/lib/social/worker";
import { publishCreative } from "@/lib/social/publish";
import { refreshAllPinMetrics } from "@/lib/social/analytics";
import {
  isPinterestConfigured,
  listBoards,
  getUserAccount,
  type PinterestBoard,
} from "@/lib/social/pinterest";

export type SocialActionResult = {
  ok: boolean;
  message: string;
  creativeId?: number;
};

/** Max jobs the manual "Process now" button drains in one click (sync). */
const MANUAL_DRAIN_MAX = Number(process.env.SOCIAL_MANUAL_DRAIN_MAX ?? 4);

const VALID_STATUS = new Set<string>(CREATIVE_STATUSES);

async function guard(): Promise<boolean> {
  return Boolean(await requireAdmin(await headers()));
}

/**
 * Generate one AI creative for a product: image (gpt-image-1) + platform caption,
 * persisted as a `draft` for human review.
 */
export async function generateCreative(input: {
  productId: number;
  preset: string;
  platform?: string;
  quality?: string;
  extra?: string;
}): Promise<SocialActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };

  if (!isImageGenConfigured()) {
    return {
      ok: false,
      message: "OPENAI_API_KEY is not set — image generation is unavailable.",
    };
  }

  const result = await runGeneration(input);
  revalidatePath("/admin/social");
  return result.ok
    ? { ok: true, message: "Creative generated.", creativeId: result.creativeId }
    : { ok: false, message: result.error };
}

// ─────────────────────────────────────────────────────────────────────────────
// BATCH FACTORY (generation queue)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enqueue a batch of generation jobs (one per product × preset). Returns the
 * number queued. A cron worker (or the manual "Process now" button) drains it.
 */
export async function enqueueBatch(input: {
  productIds: number[];
  presets: string[];
  platform?: string;
  quality?: string;
  extra?: string;
}): Promise<SocialActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };

  const productIds = Array.from(new Set(input.productIds)).filter((n) =>
    Number.isFinite(n),
  );
  const presets = Array.from(new Set(input.presets)).filter((p) =>
    Boolean(getPreset(p)),
  );
  if (productIds.length === 0 || presets.length === 0) {
    return { ok: false, message: "Pick at least one product and one preset." };
  }

  const MAX_BATCH = 200;
  const jobs = [];
  for (const productId of productIds) {
    for (const presetKey of presets) {
      const preset = getPreset(presetKey)!;
      jobs.push({
        productId,
        preset: presetKey,
        platform: input.platform ?? preset.platform,
        quality: input.quality ?? "medium",
        extra: input.extra,
      });
    }
  }
  if (jobs.length > MAX_BATCH) {
    return {
      ok: false,
      message: `That's ${jobs.length} jobs — keep a batch under ${MAX_BATCH}.`,
    };
  }

  const count = await enqueueJobs(jobs);
  revalidatePath("/admin/social");
  return {
    ok: true,
    message: `Queued ${count} creative${count === 1 ? "" : "s"}. Processing…`,
  };
}

/** Drain a bounded number of queued jobs synchronously (instant feedback). */
export async function processQueueNow(): Promise<SocialActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };
  const res = await drainQueue(MANUAL_DRAIN_MAX);
  revalidatePath("/admin/social");
  if (res.processed === 0) {
    return { ok: true, message: "Queue is empty." };
  }
  const tail =
    res.stoppedReason === "daily-limit" ? " (daily limit reached)" : "";
  return {
    ok: true,
    message: `Processed ${res.processed}: ${res.done} done, ${res.failed} failed.${tail}`,
  };
}

/** Remove finished + failed jobs from the queue table. */
export async function clearQueue(): Promise<SocialActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };
  await clearFinishedJobs();
  revalidatePath("/admin/social");
  return { ok: true, message: "Cleared finished jobs." };
}

/** Approve / reject / publish / re-draft a creative. */
export async function moderateCreative(
  id: number,
  status: string,
): Promise<SocialActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };
  if (!Number.isFinite(id) || !VALID_STATUS.has(status)) {
    return { ok: false, message: "Invalid request." };
  }
  await setCreativeStatus(id, status as CreativeStatus);
  revalidatePath("/admin/social");
  return { ok: true, message: `Creative ${status}.` };
}

/** Edit a creative's caption + hashtags. */
export async function editCreativeCopy(
  id: number,
  caption: string,
  hashtagsCsv: string,
): Promise<SocialActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };
  const hashtags = hashtagsCsv
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, "").trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 15);
  await updateCreativeCopy(id, caption.trim(), hashtags);
  revalidatePath("/admin/social");
  return { ok: true, message: "Copy updated." };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLISHING (Pinterest)
// ─────────────────────────────────────────────────────────────────────────────

export type BoardsResult = {
  ok: boolean;
  message: string;
  configured: boolean;
  boards: PinterestBoard[];
};

export type ConnectionResult = {
  ok: boolean;
  configured: boolean;
  username?: string;
  accountType?: string;
  message: string;
};

/**
 * Generate the Pinterest OAuth URL so the admin can (re)connect the brand
 * account. Requires PINTEREST_APP_ID to be set.
 */
export async function getPinterestConnectUrl(): Promise<{
  ok: boolean;
  url?: string;
  message: string;
}> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };

  const appId = process.env.PINTEREST_APP_ID;
  if (!appId) {
    return {
      ok: false,
      message:
        "PINTEREST_APP_ID is not set. Find it at developers.pinterest.com → My Apps → App ID.",
    };
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://y2kase.com";
  const redirectUri = encodeURIComponent(
    `${siteUrl}/api/auth/pinterest/callback`,
  );
  const scopes = encodeURIComponent("boards:read,boards:write,pins:read,pins:write,user_accounts:read");
  const url =
    `https://www.pinterest.com/oauth/?` +
    `client_id=${appId}&redirect_uri=${redirectUri}` +
    `&response_type=code&scope=${scopes}&state=y2kase-admin`;

  return { ok: true, url, message: "Click the URL to connect Pinterest." };
}

/** Verify the Pinterest token works and return the connected account. */
export async function checkPinterestConnection(): Promise<ConnectionResult> {
  if (!(await guard())) {
    return { ok: false, configured: false, message: "Not authorized." };
  }
  if (!isPinterestConfigured()) {
    return {
      ok: false,
      configured: false,
      message: "PINTEREST_ACCESS_TOKEN is not set.",
    };
  }
  try {
    const account = await getUserAccount();
    return {
      ok: true,
      configured: true,
      username: account.username,
      accountType: account.accountType,
      message: "Connected.",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection failed.";
    return { ok: false, configured: true, message: msg };
  }
}

/** Refresh cached Pinterest metrics for all published creatives. */
export async function refreshAnalytics(): Promise<SocialActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };
  const res = await refreshAllPinMetrics();
  revalidatePath("/admin/social");
  if (res.reason === "not-configured") {
    return { ok: false, message: "PINTEREST_ACCESS_TOKEN is not set." };
  }
  return {
    ok: true,
    message: `Metrics refreshed: ${res.updated} pin${res.updated === 1 ? "" : "s"}${
      res.failed ? `, ${res.failed} failed` : ""
    }.`,
  };
}

/** Fetch the connected Pinterest account's boards for the publish picker. */
export async function fetchPinterestBoards(): Promise<BoardsResult> {
  if (!(await guard())) {
    return { ok: false, message: "Not authorized.", configured: false, boards: [] };
  }
  if (!isPinterestConfigured()) {
    return {
      ok: false,
      message: "PINTEREST_ACCESS_TOKEN is not set.",
      configured: false,
      boards: [],
    };
  }
  try {
    const boards = await listBoards();
    return { ok: true, message: "", configured: true, boards };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load boards.";
    return { ok: false, message: msg, configured: true, boards: [] };
  }
}

/** Publish a creative to Pinterest immediately. */
export async function publishNow(
  id: number,
  boardId: string,
): Promise<SocialActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };
  if (!boardId) return { ok: false, message: "Pick a board first." };

  const creative = await getCreativeById(id);
  if (!creative) return { ok: false, message: "Creative not found." };

  const outcome = await publishCreative(creative, {
    boardId,
    revertToScheduledOnError: false,
  });
  revalidatePath("/admin/social");
  return outcome.ok
    ? { ok: true, message: "Published to Pinterest 📌", creativeId: id }
    : { ok: false, message: outcome.error };
}

/** Schedule a creative for automated publishing. `whenIso` is an ISO datetime. */
export async function schedulePublish(
  id: number,
  whenIso: string,
  boardId: string,
): Promise<SocialActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };
  if (!boardId) return { ok: false, message: "Pick a board first." };

  const when = new Date(whenIso);
  if (Number.isNaN(when.getTime())) {
    return { ok: false, message: "Invalid date/time." };
  }
  if (when.getTime() < Date.now() - 60_000) {
    return { ok: false, message: "Pick a time in the future." };
  }

  await scheduleCreative(id, when, boardId);
  revalidatePath("/admin/social");
  return { ok: true, message: "Scheduled ⏰", creativeId: id };
}

/** Delete a creative and clean up its R2 object. */
export async function removeCreative(id: number): Promise<SocialActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };
  const imageUrl = await deleteCreative(id);
  if (imageUrl) {
    const key = r2KeyFromUrl(imageUrl);
    if (key) {
      try {
        const bucket = process.env.R2_BUCKET_NAME;
        if (bucket) await deleteObjectsFromR2(makeR2Client(), bucket, [key]);
      } catch (err) {
        console.error("[social] R2 cleanup failed:", err);
      }
    }
  }
  revalidatePath("/admin/social");
  return { ok: true, message: "Creative deleted." };
}

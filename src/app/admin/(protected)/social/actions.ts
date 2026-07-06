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
import { db } from "@/lib/db";
import { socialCreatives } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { enqueueJobs, clearFinishedJobs } from "@/lib/social/jobs";
import { drainQueue } from "@/lib/social/worker";
import { publishCreative } from "@/lib/social/publish";
import { refreshAllPinMetrics } from "@/lib/social/analytics";
import { runAutoPin, AUTO_PIN_PER_RUN } from "@/lib/social/auto-pin";
import { isMetaConfigured, getMetaConnection } from "@/lib/social/meta";
import {
  runMetaAutopost,
  META_AUTOPOST_PER_RUN,
} from "@/lib/social/meta-autopost";
import {
  getProductGallery,
  importProductPhotos,
  PRODUCT_PHOTO_PRESET,
  type ProductGallery,
} from "@/lib/social/product-photos";
import type { SocialPlatform } from "@/lib/social/presets";
import {
  isPinterestConfigured,
  listBoards,
  getUserAccount,
  type PinterestBoard,
} from "@/lib/social/pinterest";
import {
  isTikTokConfigured,
  getTikTokAccount,
} from "@/lib/social/tiktok";
import { getToken } from "@/lib/social/token-store";

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

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT PHOTO IMPORT (use real catalog photos instead of AI imagery)
// ─────────────────────────────────────────────────────────────────────────────

export type GalleryResult = {
  ok: boolean;
  message: string;
  gallery: ProductGallery | null;
};

/** Load a product's real photo gallery for the import picker. */
export async function listProductPhotos(
  productId: number,
): Promise<GalleryResult> {
  if (!(await guard())) {
    return { ok: false, message: "Not authorized.", gallery: null };
  }
  if (!Number.isFinite(productId)) {
    return { ok: false, message: "Invalid product.", gallery: null };
  }
  const gallery = await getProductGallery(productId);
  if (!gallery) {
    return { ok: false, message: "Product not found.", gallery: null };
  }
  if (gallery.photos.length === 0) {
    return { ok: false, message: "This product has no photos.", gallery };
  }
  return { ok: true, message: "", gallery };
}

/** Turn selected real product photos into draft creatives. */
export async function importPhotos(input: {
  productId: number;
  imageUrls: string[];
  platform?: string;
  withCaption?: boolean;
}): Promise<SocialActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };

  if (input.withCaption && !isImageGenConfigured()) {
    // Caption needs OPENAI_API_KEY; degrade gracefully to no-caption import.
    input.withCaption = false;
  }

  const result = await importProductPhotos({
    productId: input.productId,
    imageUrls: input.imageUrls,
    platform: (input.platform as SocialPlatform) ?? "pinterest",
    withCaption: input.withCaption,
  });

  revalidatePath("/admin/social");
  return result.ok
    ? {
        ok: true,
        message: `Imported ${result.created} photo${result.created === 1 ? "" : "s"} as drafts 📸`,
      }
    : { ok: false, message: result.error };
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

// ─────────────────────────────────────────────────────────────────────────────
// TIKTOK CONNECTION
// ─────────────────────────────────────────────────────────────────────────────

export type TikTokConnectionResult = {
  ok: boolean;
  configured: boolean;
  displayName?: string;
  sandboxOnly?: boolean;
  message: string;
};

/** Verify the TikTok token and return account details. */
export async function checkTikTokConnection(): Promise<TikTokConnectionResult> {
  if (!(await guard())) {
    return { ok: false, configured: false, message: "Not authorized." };
  }
  if (!isTikTokConfigured()) {
    return {
      ok: false,
      configured: false,
      message: "TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET not set.",
    };
  }
  const row = await getToken("tiktok");
  if (!row) {
    return {
      ok: false,
      configured: true,
      message: "Not connected. Click Connect TikTok to authorise.",
    };
  }
  try {
    const account = await getTikTokAccount();
    return {
      ok: true,
      configured: true,
      displayName: account.displayName,
      // While unaudited, posts go private — note this in the UI.
      sandboxOnly: true,
      message: "Connected.",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection failed.";
    return { ok: false, configured: true, message: msg };
  }
}

/** Generate the TikTok OAuth URL for the admin to click. */
export async function getTikTokConnectUrl(): Promise<{
  ok: boolean;
  url?: string;
  message: string;
}> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  if (!clientKey) {
    return {
      ok: false,
      message:
        "TIKTOK_CLIENT_KEY is not set. Create a TikTok developer app at developers.tiktok.com and add the key to your environment.",
    };
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://y2kase.com";
  const redirectUri = encodeURIComponent(`${siteUrl}/api/auth/tiktok/callback`);
  const scopes = encodeURIComponent("user.info.basic,video.upload,video.publish");
  const url =
    `https://www.tiktok.com/v2/auth/authorize/?` +
    `client_key=${clientKey}&redirect_uri=${redirectUri}` +
    `&response_type=code&scope=${scopes}&state=y2kase-admin`;

  return { ok: true, url, message: "Click the URL to connect TikTok." };
}

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

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-PIN (autonomous daily drip)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Manually trigger the auto-pin drip — posts the next un-pinned listing(s) right
 * now (every photo + the video), mirroring exactly what the daily cron does, for
 * instant feedback and to seed the pipeline without waiting for the schedule.
 * `boardId` is optional; when omitted, PINTEREST_AUTOPIN_BOARD_ID (or the first
 * board) is used.
 */
export async function runAutoPinNow(input?: {
  boardId?: string;
  max?: number;
}): Promise<SocialActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };

  const max = Math.min(5, Math.max(1, input?.max ?? AUTO_PIN_PER_RUN));
  const res = await runAutoPin({ max, boardId: input?.boardId });
  revalidatePath("/admin/social");

  if (res.reason === "no-pinterest-token") {
    return { ok: false, message: "Connect Pinterest first." };
  }
  if (res.reason === "no-board") {
    return {
      ok: false,
      message: res.errors[0] ?? "No Pinterest board available.",
    };
  }
  if (res.reason === "all-pinned") {
    return { ok: true, message: "Every listing is already pinned 🎉" };
  }
  if (res.mediaPinned === 0 && res.failed === 0) {
    return { ok: true, message: "Nothing new to post right now." };
  }
  const listings = res.listingsProcessed;
  const tail = res.failed ? ` · ${res.failed} failed` : "";
  return {
    ok: res.failed === 0,
    message: `Posted ${res.mediaPinned} pin${res.mediaPinned === 1 ? "" : "s"} across ${listings} listing${listings === 1 ? "" : "s"} to Pinterest 📌${tail}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// META (Instagram + Facebook) auto-posting
// ─────────────────────────────────────────────────────────────────────────────

export type MetaConnectionResult = {
  ok: boolean;
  configured: boolean;
  connected: boolean;
  pageName?: string;
  igUsername?: string;
  message: string;
};

/** Build the Meta OAuth URL for connecting a Facebook Page + Instagram. */
export async function getMetaConnectUrl(): Promise<{
  ok: boolean;
  url?: string;
  message: string;
}> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };

  const appId = process.env.META_APP_ID;
  if (!appId) {
    return {
      ok: false,
      message:
        "META_APP_ID is not set. Create an app at developers.facebook.com → add Facebook Login + Instagram, then add the App ID.",
    };
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://y2kase.com";
  const redirectUri = encodeURIComponent(
    process.env.META_REDIRECT_URI ?? `${siteUrl}/api/auth/meta/callback`,
  );
  // Permissions required for IG/FB content publishing (need App Review in prod).
  const scope = encodeURIComponent(
    [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "publish_video",
      "instagram_basic",
      "instagram_content_publish",
      "business_management",
    ].join(","),
  );
  const version = process.env.META_GRAPH_VERSION ?? "v25.0";
  const url =
    `https://www.facebook.com/${version}/dialog/oauth?` +
    `client_id=${appId}&redirect_uri=${redirectUri}` +
    `&response_type=code&scope=${scope}&state=y2kase-admin`;

  return { ok: true, url, message: "Click to connect Instagram + Facebook." };
}

/** Verify the stored Meta token still works and return the connected accounts. */
export async function checkMetaConnection(): Promise<MetaConnectionResult> {
  if (!(await guard())) {
    return { ok: false, configured: false, connected: false, message: "Not authorized." };
  }
  if (!isMetaConfigured()) {
    return {
      ok: false,
      configured: false,
      connected: false,
      message: "META_APP_ID / META_APP_SECRET not set.",
    };
  }
  const conn = await getMetaConnection();
  return {
    ok: conn.connected,
    configured: true,
    connected: conn.connected,
    pageName: conn.pageName,
    igUsername: conn.igUsername,
    message: conn.message,
  };
}

/** Manually trigger the Meta drip — posts the next listing to IG + FB now. */
export async function runMetaAutopostNow(input?: {
  max?: number;
}): Promise<SocialActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };

  const max = Math.min(5, Math.max(1, input?.max ?? META_AUTOPOST_PER_RUN));
  const res = await runMetaAutopost({ max });
  revalidatePath("/admin/social");

  if (res.reason === "not-configured") {
    return { ok: false, message: "Set META_APP_ID / META_APP_SECRET first." };
  }
  if (res.reason === "not-connected") {
    return { ok: false, message: "Connect Instagram / Facebook first." };
  }
  if (res.reason === "all-posted") {
    return { ok: true, message: "Every listing is already posted to Meta 🎉" };
  }
  if (res.posted === 0 && res.failed === 0) {
    return { ok: true, message: "Nothing new to post right now." };
  }
  const tail = res.failed ? ` · ${res.failed} failed` : "";
  return {
    ok: res.failed === 0,
    message: `Posted ${res.posted} update${res.posted === 1 ? "" : "s"} across ${res.listingsProcessed} listing${res.listingsProcessed === 1 ? "" : "s"} to ${res.platforms.join(" + ")} 📣${tail}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BULK OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

export type BulkActionResult = {
  ok: boolean;
  message: string;
  succeeded: number;
  failed: number;
  errors: string[];
};

/**
 * Approve, reject, or re-draft multiple creatives in one click.
 * Used for "Select all → Approve all" in the Social Studio.
 */
export async function bulkModerate(
  ids: number[],
  status: string,
): Promise<BulkActionResult> {
  if (!(await guard()))
    return { ok: false, message: "Not authorized.", succeeded: 0, failed: 0, errors: [] };
  if (!VALID_STATUS.has(status))
    return { ok: false, message: "Invalid status.", succeeded: 0, failed: 0, errors: [] };

  const uniq = Array.from(new Set(ids.filter(Number.isFinite)));
  if (uniq.length === 0)
    return { ok: false, message: "No creatives selected.", succeeded: 0, failed: 0, errors: [] };

  let succeeded = 0;
  const errors: string[] = [];
  for (const id of uniq) {
    try {
      await setCreativeStatus(id, status as CreativeStatus);
      succeeded++;
    } catch (err) {
      errors.push(`#${id}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }
  revalidatePath("/admin/social");
  return {
    ok: errors.length === 0,
    message: `${succeeded} creative${succeeded === 1 ? "" : "s"} set to ${status}.${errors.length ? ` ${errors.length} failed.` : ""}`,
    succeeded,
    failed: errors.length,
    errors,
  };
}

/**
 * Publish multiple approved creatives immediately, one after the other.
 * A 1-second pause between each post avoids Pinterest rate limits (6 req/min).
 * Cap at 25 pins to respect Pinterest's daily write limit.
 */
export async function bulkPublishNow(input: {
  ids: number[];
  boardId: string;
}): Promise<BulkActionResult> {
  if (!(await guard()))
    return { ok: false, message: "Not authorized.", succeeded: 0, failed: 0, errors: [] };
  if (!input.boardId)
    return { ok: false, message: "Pick a board first.", succeeded: 0, failed: 0, errors: [] };

  const uniq = Array.from(new Set(input.ids.filter(Number.isFinite))).slice(0, 25);
  if (uniq.length === 0)
    return { ok: false, message: "No creatives selected.", succeeded: 0, failed: 0, errors: [] };

  let succeeded = 0;
  const errors: string[] = [];

  for (const id of uniq) {
    const creative = await getCreativeById(id);
    if (!creative) {
      errors.push(`#${id}: not found`);
      continue;
    }
    const outcome = await publishCreative(creative, {
      boardId: input.boardId,
      revertToScheduledOnError: false,
    });
    if (outcome.ok) {
      succeeded++;
    } else {
      errors.push(`#${id}: ${outcome.error}`);
    }
    // 1-second pause to avoid hitting Pinterest's 6 req/min rate limit.
    if (uniq.indexOf(id) < uniq.length - 1) {
      await new Promise((r) => setTimeout(r, 1100));
    }
  }

  revalidatePath("/admin/social");
  return {
    ok: errors.length === 0,
    message: `Published ${succeeded}/${uniq.length} pin${succeeded === 1 ? "" : "s"} to Pinterest 📌${errors.length ? ` — ${errors.length} failed.` : ""}`,
    succeeded,
    failed: errors.length,
    errors,
  };
}

/**
 * Schedule multiple creatives as an automatic daily DRIP — the consistency-
 * first approach used by top DTC brands. Pinterest's algorithm rewards
 * steady, daily fresh-pin activity far more than dumping everything at once.
 *
 * Because the publish cron runs once per day (see vercel.json →
 * /api/cron/social-publish at 17:00 UTC = ~1pm ET / 10am PT, a Pinterest peak
 * window), we schedule each day's batch at 06:00 UTC — comfortably before the
 * cron — so that day's pins are "due" and go live in that day's run. Pins are
 * spread across consecutive days: `pinsPerDay` each day.
 *
 * Example: 30 pins at 3/day → published 3 per day over the next 10 days,
 * each day's batch going live in the daily 17:00 UTC publish run.
 */
export async function bulkStaggeredSchedule(input: {
  ids: number[];
  boardId: string;
  /** ISO date string for the first day, e.g. "2026-06-12". Defaults to tomorrow. */
  startDate?: string;
  /** Pins per day (1-5). Default 3. */
  pinsPerDay?: number;
}): Promise<BulkActionResult> {
  if (!(await guard()))
    return { ok: false, message: "Not authorized.", succeeded: 0, failed: 0, errors: [] };
  if (!input.boardId)
    return { ok: false, message: "Pick a board first.", succeeded: 0, failed: 0, errors: [] };

  const uniq = Array.from(new Set(input.ids.filter(Number.isFinite)));
  if (uniq.length === 0)
    return { ok: false, message: "No creatives selected.", succeeded: 0, failed: 0, errors: [] };

  const pinsPerDay = Math.min(5, Math.max(1, input.pinsPerDay ?? 3));

  // Each day's pins are scheduled at 06:00 UTC + minute offsets (purely to
  // preserve a stable publish order). They become "due" well before the daily
  // 17:00 UTC publish cron, so the whole day's batch goes live in that run.
  const DRIP_HOUR_UTC = 6;

  // Start date: tomorrow at midnight UTC if not specified.
  let start: Date;
  if (input.startDate) {
    start = new Date(`${input.startDate}T00:00:00Z`);
  } else {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    start = tomorrow;
  }
  if (Number.isNaN(start.getTime())) {
    return { ok: false, message: "Invalid start date.", succeeded: 0, failed: 0, errors: [] };
  }

  let succeeded = 0;
  const errors: string[] = [];

  for (let i = 0; i < uniq.length; i++) {
    const id = uniq[i];
    const dayOffset = Math.floor(i / pinsPerDay);
    const slotIndex = i % pinsPerDay;

    const when = new Date(start);
    when.setUTCDate(when.getUTCDate() + dayOffset);
    when.setUTCHours(DRIP_HOUR_UTC, slotIndex, 0, 0);

    try {
      await scheduleCreative(id, when, input.boardId);
      succeeded++;
    } catch (err) {
      errors.push(`#${id}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  const days = Math.ceil(uniq.length / pinsPerDay);
  revalidatePath("/admin/social");
  return {
    ok: errors.length === 0,
    message: `Scheduled ${succeeded} pin${succeeded === 1 ? "" : "s"} as a daily drip across ${days} day${days === 1 ? "" : "s"} (${pinsPerDay}/day) ⏰`,
    succeeded,
    failed: errors.length,
    errors,
  };
}

/**
 * Clear the lastError on selected creatives and reset to "approved"
 * so they can be retried. Useful for pins that failed due to trial-period
 * 403 errors — now that Standard access is active, simply retry them.
 */
export async function retryFailed(ids: number[]): Promise<BulkActionResult> {
  if (!(await guard()))
    return { ok: false, message: "Not authorized.", succeeded: 0, failed: 0, errors: [] };

  const uniq = Array.from(new Set(ids.filter(Number.isFinite)));
  if (uniq.length === 0)
    return { ok: false, message: "No creatives selected.", succeeded: 0, failed: 0, errors: [] };

  let succeeded = 0;
  const errors: string[] = [];
  for (const id of uniq) {
    try {
      await setCreativeStatus(id, "approved");
      // Clear the last error message.
      await db
        .update(socialCreatives)
        .set({ lastError: null, updatedAt: new Date() })
        .where(eq(socialCreatives.id, id));
      succeeded++;
    } catch (err) {
      errors.push(`#${id}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }
  revalidatePath("/admin/social");
  return {
    ok: errors.length === 0,
    message: `${succeeded} creative${succeeded === 1 ? "" : "s"} reset for retry.`,
    succeeded,
    failed: errors.length,
    errors,
  };
}

/** Delete a creative and clean up its R2 object. */
export async function removeCreative(id: number): Promise<SocialActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };

  // Product-photo creatives point at the live storefront image on R2 — we must
  // NOT delete that object, only the creative row. Only AI-generated creatives
  // own their R2 asset and may clean it up.
  const existing = await getCreativeById(id);
  const isProductPhoto = existing?.preset === PRODUCT_PHOTO_PRESET;

  const imageUrl = await deleteCreative(id);
  if (imageUrl && !isProductPhoto) {
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

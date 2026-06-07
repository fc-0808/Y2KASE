/**
 * Social Studio — publishing orchestration.
 *
 * Shared by the admin "Publish now" action and the scheduled-publish cron.
 * Routes a creative to the correct platform client based on creative.platform.
 *
 * Supported platforms:
 *   pinterest  — image/photo pins via Pinterest API v5
 *   tiktok     — video posts via TikTok Content Posting API v2 (PULL_FROM_URL)
 */

import { createPin, isPinterestConfigured } from "@/lib/social/pinterest";
import {
  postVideo,
  getCreatorInfo,
  isTikTokConfigured,
} from "@/lib/social/tiktok";
import {
  markPublished,
  markPublishFailed,
  type SocialCreative,
} from "@/lib/social/creatives";

export type PublishOutcome =
  | { ok: true; externalId: string; externalUrl: string }
  | { ok: false; error: string };

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://y2kase.com"
  );
}

function productLink(
  creative: SocialCreative,
  platform: "pinterest" | "tiktok" | string,
): string {
  const utm = `utm_source=${platform}&utm_medium=social&utm_campaign=auto_post`;
  if (creative.productSlug) {
    return `${siteUrl()}/products/${creative.productSlug}?${utm}`;
  }
  return `${siteUrl()}/products?${utm}`;
}

/**
 * The proxied video URL that TikTok's servers will download from.
 * Uses our verified y2kase.com domain so TikTok accepts the request.
 */
function tiktokVideoUrl(productId: number): string {
  return `${siteUrl()}/api/video/${productId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pinterest
// ─────────────────────────────────────────────────────────────────────────────

async function publishToPinterest(
  creative: SocialCreative,
  boardId: string,
): Promise<PublishOutcome> {
  if (!isPinterestConfigured()) {
    throw new Error("PINTEREST_ACCESS_TOKEN is not set.");
  }
  if (!boardId) {
    throw new Error("No Pinterest board selected for this creative.");
  }

  const description = [
    creative.caption,
    creative.hashtags.map((t) => `#${t}`).join(" "),
  ]
    .filter(Boolean)
    .join("\n\n");

  const pin = await createPin({
    boardId,
    imageUrl: creative.imageUrl,
    title: creative.productTitle ?? undefined,
    description: description || undefined,
    link: productLink(creative, "pinterest"),
  });

  return { ok: true, externalId: pin.id, externalUrl: pin.url };
}

// ─────────────────────────────────────────────────────────────────────────────
// TikTok
// ─────────────────────────────────────────────────────────────────────────────

async function publishToTikTok(
  creative: SocialCreative,
): Promise<PublishOutcome> {
  if (!isTikTokConfigured()) {
    throw new Error("TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET not set.");
  }
  if (!creative.productId) {
    throw new Error("TikTok publishing requires a linked product (for the video proxy URL).");
  }

  // TikTok compliance: must query allowed privacy levels before each post.
  const creator = await getCreatorInfo();
  const privacyLevel = creator.privacyLevelOptions[0];
  if (!privacyLevel) {
    throw new Error("Could not determine privacy level from TikTok creator info.");
  }

  // Build caption: title + caption + hashtags as TikTok title (150 char limit).
  const hashtags = creative.hashtags.map((t) => `#${t}`).join(" ");
  const title = [
    creative.productTitle,
    creative.caption,
    hashtags,
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 150);

  const videoUrl = tiktokVideoUrl(creative.productId);

  const result = await postVideo({
    videoUrl,
    title,
    privacyLevel,
    // Allow duets + stitches — free UGC for a brand is gold.
    disableDuet: false,
    disableStitch: false,
    disableComment: false,
  });

  // The publish_id is the external id; TikTok generates a post URL once
  // processing completes. We store the publish_id and poll for the final URL
  // via the social-analytics cron (or the admin can click "Refresh metrics").
  const externalUrl = `https://www.tiktok.com/@${process.env.TIKTOK_ACCOUNT_NAME ?? "y2kase"}/video/${result.publishId}`;

  return {
    ok: true,
    externalId: result.publishId,
    externalUrl,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Publish a single creative to its target platform.
 * Assumes the caller has already claimed the row (or is the admin acting on it).
 * On failure, records the error and reverts status appropriately.
 */
export async function publishCreative(
  creative: SocialCreative,
  opts: { boardId?: string; revertToScheduledOnError?: boolean } = {},
): Promise<PublishOutcome> {
  const boardId = opts.boardId ?? creative.boardId ?? undefined;

  try {
    let outcome: PublishOutcome;

    if (creative.platform === "pinterest") {
      outcome = await publishToPinterest(creative, boardId ?? "");
    } else if (creative.platform === "tiktok") {
      outcome = await publishToTikTok(creative);
    } else {
      throw new Error(
        `Automated publishing is not yet available for "${creative.platform}". Download the creative and post manually.`,
      );
    }

    if (outcome.ok) {
      await markPublished(creative.id, outcome.externalId, outcome.externalUrl);
    } else {
      await markPublishFailed(
        creative.id,
        outcome.error,
        opts.revertToScheduledOnError ?? true,
      );
    }
    return outcome;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed.";
    await markPublishFailed(
      creative.id,
      message,
      opts.revertToScheduledOnError ?? true,
    );
    return { ok: false, error: message };
  }
}

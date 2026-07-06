/**
 * Social Studio — publishing orchestration.
 *
 * Shared by the admin "Publish now" action and the scheduled-publish cron.
 * Routes a creative to the correct platform client based on creative.platform.
 *
 * Supported platforms:
 *   pinterest  — image/photo + video pins via Pinterest API v5
 *   tiktok     — video posts via TikTok Content Posting API v2 (PULL_FROM_URL)
 *   instagram  — carousel (photos) + Reels (video) via Meta Graph API
 *   facebook   — multi-photo feed post + video via Meta Graph API
 */

import {
  createPin,
  createVideoPin,
  isPinterestConfigured,
} from "@/lib/social/pinterest";
import {
  postVideo,
  getCreatorInfo,
  isTikTokConfigured,
} from "@/lib/social/tiktok";
import {
  isMetaConfigured,
  publishInstagramCarousel,
  publishInstagramReel,
  publishFacebookPhotos,
  publishFacebookVideo,
  IG_CAROUSEL_MAX,
} from "@/lib/social/meta";
import { getProductGallery } from "@/lib/social/product-photos";
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

/**
 * Pinterest is a visual SEARCH engine — pins rank for the keywords in their
 * title, description and board. We therefore:
 *   - title:       keyword-rich, ≤100 chars, brand suffix for recognition.
 *   - description: front-loads the caption (the part Pinterest indexes most
 *                  heavily), then a soft CTA, then hashtags as discovery aids.
 *   - alt_text:    a literal, accessible description that also feeds Pinterest
 *                  visual search and improves ranking.
 */
function buildPinTitle(creative: SocialCreative): string | undefined {
  // Prefer the per-pin SEO title (distinct across a listing's pins); fall back
  // to the product title with a brand suffix for recognition.
  const perPin = creative.title?.trim();
  if (perPin) return perPin.slice(0, 100);
  const base = creative.productTitle?.trim();
  if (!base) return undefined;
  const withBrand = /y2kase/i.test(base) ? base : `${base} | Y2KASE`;
  return withBrand.slice(0, 100);
}

function buildPinDescription(creative: SocialCreative): string | undefined {
  const caption = creative.caption?.trim();
  const hashtags = creative.hashtags.map((t) => `#${t}`).join(" ");
  const cta = "Shop now at y2kase.com ✨";
  const parts = [caption, cta, hashtags].filter(Boolean);
  const description = parts.join("\n\n");
  return description ? description.slice(0, 800) : undefined;
}

function buildPinAltText(creative: SocialCreative): string | undefined {
  const title = creative.productTitle?.trim();
  if (!title) return undefined;
  const cues = creative.hashtags.slice(0, 4).join(", ");
  const alt = cues
    ? `${title} — kawaii Y2K phone accessory. Style: ${cues}.`
    : `${title} — kawaii Y2K phone accessory by Y2KASE.`;
  return alt.slice(0, 500);
}

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

  const common = {
    boardId,
    title: buildPinTitle(creative),
    description: buildPinDescription(creative),
    altText: buildPinAltText(creative),
    link: productLink(creative, "pinterest"),
  };

  // Video pins upload the source clip and require a cover image; photo pins post
  // the image URL directly.
  if (creative.mediaType === "video") {
    if (!creative.videoUrl) {
      throw new Error("Video creative is missing its source video URL.");
    }
    const pin = await createVideoPin({
      ...common,
      videoUrl: creative.videoUrl,
      coverImageUrl: creative.imageUrl,
    });
    return { ok: true, externalId: pin.id, externalUrl: pin.url };
  }

  const pin = await createPin({
    ...common,
    imageUrl: creative.imageUrl,
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
// Meta (Instagram + Facebook)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Caption shared by IG + FB: the copy, hashtags, then a shop line. On Facebook
 * the URL is clickable; on Instagram it reads as plain text (IG doesn't linkify
 * captions) but still tells shoppers where to go.
 */
function buildMetaCaption(
  creative: SocialCreative,
  platform: "instagram" | "facebook",
): string {
  const lead = creative.caption?.trim() || creative.productTitle?.trim() || "";
  const hashtags = creative.hashtags
    .slice(0, 30)
    .map((t) => `#${t}`)
    .join(" ");
  const shop = `🛍️ Shop: ${productLink(creative, platform)}`;
  return [lead, hashtags, shop].filter(Boolean).join("\n\n").slice(0, 2200);
}

async function publishToInstagram(
  creative: SocialCreative,
): Promise<PublishOutcome> {
  if (!isMetaConfigured()) {
    throw new Error("META_APP_ID / META_APP_SECRET not set.");
  }
  if (!creative.productId) {
    throw new Error("Instagram publishing requires a linked product.");
  }
  const gallery = await getProductGallery(creative.productId);
  if (!gallery) throw new Error("Product not found for Instagram post.");

  const caption = buildMetaCaption(creative, "instagram");

  if (creative.mediaType === "video") {
    const videoUrl = creative.videoUrl ?? gallery.videoUrl;
    if (!videoUrl) throw new Error("No video available for this listing.");
    const cover = creative.imageUrl ?? gallery.photos[0]?.url;
    const post = await publishInstagramReel({ videoUrl, caption, coverUrl: cover });
    return { ok: true, externalId: post.id, externalUrl: post.url };
  }

  const imageUrls = gallery.photos
    .map((p) => p.url)
    .filter((u) => /^https?:\/\//.test(u))
    .slice(0, IG_CAROUSEL_MAX);
  if (imageUrls.length === 0) throw new Error("No images available for this listing.");
  const post = await publishInstagramCarousel({ imageUrls, caption });
  return { ok: true, externalId: post.id, externalUrl: post.url };
}

async function publishToFacebook(
  creative: SocialCreative,
): Promise<PublishOutcome> {
  if (!isMetaConfigured()) {
    throw new Error("META_APP_ID / META_APP_SECRET not set.");
  }
  if (!creative.productId) {
    throw new Error("Facebook publishing requires a linked product.");
  }
  const gallery = await getProductGallery(creative.productId);
  if (!gallery) throw new Error("Product not found for Facebook post.");

  const message = buildMetaCaption(creative, "facebook");

  if (creative.mediaType === "video") {
    const videoUrl = creative.videoUrl ?? gallery.videoUrl;
    if (!videoUrl) throw new Error("No video available for this listing.");
    const post = await publishFacebookVideo({ videoUrl, description: message });
    return { ok: true, externalId: post.id, externalUrl: post.url };
  }

  const imageUrls = gallery.photos
    .map((p) => p.url)
    .filter((u) => /^https?:\/\//.test(u));
  if (imageUrls.length === 0) throw new Error("No images available for this listing.");
  const post = await publishFacebookPhotos({ imageUrls, message });
  return { ok: true, externalId: post.id, externalUrl: post.url };
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
    } else if (creative.platform === "instagram") {
      outcome = await publishToInstagram(creative);
    } else if (creative.platform === "facebook") {
      outcome = await publishToFacebook(creative);
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

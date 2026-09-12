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
import {
  buildFacebookCaption,
  buildInstagramCaption,
} from "@/lib/social/instagram-strategy";
import {
  altTextFromPrompt,
  buildPinterestAltText,
  buildPinterestDescription,
  sanitizePinterestTitle,
} from "@/lib/social/pinterest-strategy";

export type PublishOutcome =
  | { ok: true; externalId: string; externalUrl: string }
  | { ok: false; error: string };

/**
 * Canonical public storefront URL for outbound social destination links.
 * Pinterest (and most social APIs) reject localhost / non-HTTPS destinations,
 * so local `.env` values like `http://localhost:3000` must never reach the API.
 */
function publicSiteUrl(): string {
  const fallback = "https://y2kase.com";
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || fallback;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (
      u.protocol !== "https:" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".local")
    ) {
      return fallback;
    }
    return `${u.protocol}//${u.host}`;
  } catch {
    return fallback;
  }
}

function productLink(
  creative: SocialCreative,
  platform: "pinterest" | "tiktok" | string,
): string {
  const base = publicSiteUrl();
  const utm = `utm_source=${platform}&utm_medium=social&utm_campaign=auto_post`;
  if (creative.productSlug) {
    return `${base}/products/${creative.productSlug}?${utm}`;
  }
  return `${base}/products?${utm}`;
}

/**
 * The proxied video URL that TikTok's servers will download from.
 * Uses our verified y2kase.com domain so TikTok accepts the request.
 */
function tiktokVideoUrl(productId: number): string {
  return `${publicSiteUrl()}/api/video/${productId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pinterest
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pinterest is a visual SEARCH engine — pins rank for the keywords in their
 * title, description and board. Copy is sanitised in pinterest-strategy so we
 * never ship "Stylish iPhone 17 Case:" stuffing or comma-separated keyword lists.
 */
function buildPinTitle(creative: SocialCreative): string | undefined {
  const perPin = creative.title?.trim();
  if (perPin) {
    const cleaned = sanitizePinterestTitle(perPin, creative.productTitle ?? "");
    if (cleaned) return cleaned;
  }
  const base = creative.productTitle?.trim();
  return base ? sanitizePinterestTitle(base) || base.slice(0, 100) : undefined;
}

function buildPinDescription(creative: SocialCreative): string | undefined {
  const description = buildPinterestDescription({
    caption: creative.caption,
    hashtags: creative.hashtags,
    productTitle: creative.productTitle,
  });
  return description || undefined;
}

function buildPinAltText(creative: SocialCreative): string | undefined {
  const alt = buildPinterestAltText({
    imageAlt: altTextFromPrompt(creative.prompt),
    productTitle: creative.productTitle,
  });
  return alt || undefined;
}

async function publishToPinterest(
  creative: SocialCreative,
  boardId: string,
  imageUrlOverride?: string,
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

  const pinImageUrl = imageUrlOverride || creative.imageUrl;

  // Video pins upload the source clip and require a cover image; photo pins post
  // the image URL directly.
  if (creative.mediaType === "video") {
    if (!creative.videoUrl) {
      throw new Error("Video creative is missing its source video URL.");
    }
    const pin = await createVideoPin({
      ...common,
      videoUrl: creative.videoUrl,
      coverImageUrl: pinImageUrl,
    });
    return { ok: true, externalId: pin.id, externalUrl: pin.url };
  }

  const pin = await createPin({
    ...common,
    imageUrl: pinImageUrl,
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
 * Platform-native captions. Instagram does not linkify URLs, so the CTA is
 * "link in bio" and hashtags are capped at a niche handful. Facebook keeps a
 * clickable product URL. Shared sanitiser lives in instagram-strategy.ts.
 */
function buildMetaCaption(
  creative: SocialCreative,
  platform: "instagram" | "facebook",
): string {
  const input = {
    caption: creative.caption,
    hashtags: creative.hashtags,
    productTitle: creative.productTitle,
    productUrl: productLink(creative, platform),
  };
  return platform === "instagram"
    ? buildInstagramCaption(input)
    : buildFacebookCaption(input);
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

  // Always the catalog gallery / product video — never an AI marketing still.
  // Shoppers who tap through have to see the same product they scrolled past.
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
  opts: {
    boardId?: string;
    revertToScheduledOnError?: boolean;
    /** Fresh 2:3 pin card. Catalog URL stays on the row for dedup. */
    imageUrlOverride?: string;
  } = {},
): Promise<PublishOutcome> {
  const boardId = opts.boardId ?? creative.boardId ?? undefined;

  try {
    let outcome: PublishOutcome;

    if (creative.platform === "pinterest") {
      outcome = await publishToPinterest(
        creative,
        boardId ?? "",
        opts.imageUrlOverride,
      );
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

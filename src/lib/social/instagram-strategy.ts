/**
 * Instagram editorial strategy — the rules a real social team would enforce.
 *
 * Why this file exists
 * ────────────────────
 * Pinterest and Instagram are opposite distribution problems. Pinterest is a
 * visual search index: a curated drip of fresh, distinct pins (see
 * pinterest-strategy). Instagram is a brand grid. A new shop with one post
 * does not grow by blasting AI product shots twice a day. It grows by looking
 * like a real brand: authentic media, one considered post per day, Reels for
 * discovery, a grid that shows assortment rather than the same SKU twice
 * before lunch.
 *
 * Hard rules (Glossier / Rhode / CASETiFY cadence + BURGA / plantica mix)
 * ──────────────────────────────────────────────────────────────────────
 *   1. Never auto-publish AI as "this is the SKU you will receive". Reels stay
 *      the real product clip. Fashion stills are generated as operator assets
 *      (download → post in the app → mark recorded). See instagram-fashion.ts.
 *   2. At most one Instagram post per UTC day by default. Same-day carousel +
 *      Reel of the same listing reads as spam on a 1-follower account.
 *   3. Prefer a Reel when the listing has a video that hasn't gone out. Reels
 *      are the discovery surface. Feed tiles follow the fashion mix so the
 *      grid does not become a row of case close-ups.
 *   4. Captions: fashion voice, hook on line one (the 125-char fold), 3–5
 *      niche hashtags, CTA is "link in bio". Instagram does not linkify URLs.
 *   5. Hashtag stuffing (#fyp #viral #love #fashion) is dead weight. Niche
 *      tags (character, jiraikei, y2kfashion) only.
 *
 * What a human still has to do (this module cannot)
 * ──────────────────────────────────────────────────
 * Profile category (Fashion Accessories, not 手機店), highlights, Stories,
 * comments, and a real look when you can shoot one. The desk plans the mix;
 * it is not a substitute for a person talking to the audience.
 */

import {
  fallbackFashionCaption,
  inferLookCues,
  isCatalogDumpCaption,
  stripCatalogSlogans,
  type FashionPillar,
} from "@/lib/social/instagram-fashion";

export const INSTAGRAM_HANDLE = "y2kase.co";
export const INSTAGRAM_PROFILE_URL = "https://instagram.com/y2kase.co";

/** First 3×4 grid. Below this, the profile still looks abandoned. */
export const INSTAGRAM_BOOTSTRAP_POSTS = 12;

/** Instagram's caption limit. */
export const INSTAGRAM_CAPTION_MAX = 2200;

/**
 * Hashtags past this point add noise, not reach. Instagram's own guidance and
 * 2024–2026 ranking research agree: a handful of specific tags beat a block of
 * 20 generic ones.
 */
export const INSTAGRAM_MAX_HASHTAGS = 5;

export const INSTAGRAM_LINK_IN_BIO_CTA = "Shop the look from the link in bio ✨";

export const INSTAGRAM_MANIFESTO_CTA = "CUTE BUT TOUGH · link in bio";

export type InstagramAccountPhase = "bootstrap" | "sustain";
export type InstagramMediaType = "carousel" | "video";

export type MediaDue = {
  carousel: boolean;
  video: boolean;
};

export type InstagramSlotPlan =
  | {
      action: "post";
      mediaType: InstagramMediaType;
      reason: "prefer-reel" | "video-remaining" | "carousel-remaining";
    }
  | { action: "skip"; reason: "daily-cap" | "nothing-left" | "no-media" };

/**
 * Daily Instagram volume. Default 1. Hard-capped at 2 so an env typo cannot
 * turn a new account into a firehose. Raise only after the grid looks like a
 * shop and comments are being answered.
 */
export function instagramPostsPerDay(
  raw: string | undefined = process.env.META_IG_POSTS_PER_DAY,
): number {
  const n = Number(raw ?? 1);
  if (!Number.isFinite(n)) return 1;
  return Math.min(2, Math.max(1, Math.floor(n)));
}

export function instagramPhase(publishedCount: number): InstagramAccountPhase {
  const n = Number.isFinite(publishedCount) ? Math.max(0, publishedCount) : 0;
  return n < INSTAGRAM_BOOTSTRAP_POSTS ? "bootstrap" : "sustain";
}

export function bootstrapRemaining(publishedCount: number): number {
  return Math.max(0, INSTAGRAM_BOOTSTRAP_POSTS - Math.max(0, publishedCount));
}

export function mediaDue(input: {
  hasPhotos: boolean;
  hasVideo: boolean;
  photosPosted: boolean;
  videoPosted: boolean;
}): MediaDue {
  return {
    carousel: Boolean(input.hasPhotos) && !input.photosPosted,
    video: Boolean(input.hasVideo) && !input.videoPosted,
  };
}

/** Reel first when both are due — discovery over grid-fill. */
export function pickPreferredMedia(due: MediaDue): InstagramMediaType | null {
  if (due.video) return "video";
  if (due.carousel) return "carousel";
  return null;
}

/**
 * Decide the single Instagram post for this listing today.
 *
 * Product *selection* (coverage-first: never-posted SKUs before second-pass
 * carousels) lives in the auto-poster SQL. This function only picks the media
 * type and enforces the daily cap.
 */
export function planInstagramSlot(input: {
  hasPhotos: boolean;
  hasVideo: boolean;
  photosPosted: boolean;
  videoPosted: boolean;
  igPostedToday: number;
  dailyCap?: number;
}): InstagramSlotPlan {
  const cap = input.dailyCap ?? instagramPostsPerDay();
  if (input.igPostedToday >= cap) {
    return { action: "skip", reason: "daily-cap" };
  }
  if (!input.hasPhotos && !input.hasVideo) {
    return { action: "skip", reason: "no-media" };
  }
  const due = mediaDue(input);
  const mediaType = pickPreferredMedia(due);
  if (!mediaType) return { action: "skip", reason: "nothing-left" };
  if (mediaType === "video") {
    return {
      action: "post",
      mediaType,
      reason: due.carousel ? "prefer-reel" : "video-remaining",
    };
  }
  return { action: "post", mediaType, reason: "carousel-remaining" };
}

export function describeSlot(plan: InstagramSlotPlan): string {
  if (plan.action === "skip") {
    if (plan.reason === "daily-cap") {
      return "Today's Instagram slot is already used — next post tomorrow.";
    }
    if (plan.reason === "no-media") {
      return "This listing has no postable photos or video.";
    }
    return "This listing is already posted on Instagram.";
  }
  if (plan.mediaType === "video") {
    return plan.reason === "prefer-reel"
      ? "Reel first — Reels are how new accounts get discovered. The photo carousel waits so the grid shows more products before repeating a SKU."
      : "Reel from the product video.";
  }
  return "Feed tile — fashion still when the mix says look/still/graphic/world; a tight catalog crop on detail days. Not a white-background SKU dump.";
}

// ─────────────────────────────────────────────────────────────────────────────
// Caption policy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generic / engagement-bait tags. They do not help a 1-follower shop get found
 * and they make the caption look automated.
 */
export const INSTAGRAM_BANNED_HASHTAGS = new Set([
  "love",
  "instagood",
  "instagram",
  "instadaily",
  "instalike",
  "viral",
  "fyp",
  "foryou",
  "foryoupage",
  "explore",
  "explorepage",
  "reels",
  "reelsinstagram",
  "follow",
  "followme",
  "like",
  "likeforlike",
  "likeforfollow",
  "comment",
  "spam",
  "photooftheday",
  "beautiful",
  "fashion",
  "style",
  "art",
  "trending",
  "trend",
  "sale",
  "shopnow",
  "smallbusiness",
]);

const HASHTAG_RE = /^[a-z0-9_]{2,30}$/;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const TRAILING_HASHTAG_BLOCK_RE = /(?:\s*#\w+)+\s*$/;

export function sanitizeInstagramHashtags(tags: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const tag = raw.replace(/^#/, "").trim().toLowerCase();
    if (!HASHTAG_RE.test(tag)) continue;
    if (INSTAGRAM_BANNED_HASHTAGS.has(tag)) continue;
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= INSTAGRAM_MAX_HASHTAGS) break;
  }
  return out;
}

export function sanitizeInstagramCaption(caption: string): string {
  const stripped = caption
    .replace(URL_RE, " ")
    .replace(TRAILING_HASHTAG_BLOCK_RE, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]{2,}/g, " ")
    .trim();
  return stripped;
}

export type CaptionInput = {
  caption?: string | null;
  hashtags?: readonly string[];
  productTitle?: string | null;
  productUrl?: string | null;
  pillar?: FashionPillar;
  characterName?: string | null;
  brandName?: string | null;
  tags?: readonly string[];
};

export function fallbackInstagramCaption(
  productTitle: string,
  pillar: FashionPillar = "look",
  extra?: {
    characterName?: string | null;
    brandName?: string | null;
    tags?: readonly string[];
  },
): string {
  const cues = inferLookCues({
    title: productTitle,
    tags: extra?.tags,
    characterName: extra?.characterName,
    brandName: extra?.brandName,
  });
  return fallbackFashionCaption(pillar, cues);
}

function captionBody(input: CaptionInput): string {
  const pillar = input.pillar ?? "look";
  const extra = {
    characterName: input.characterName,
    brandName: input.brandName,
    tags: input.tags,
  };
  const cleaned = stripCatalogSlogans(
    sanitizeInstagramCaption(input.caption ?? ""),
  );
  const title = input.productTitle ?? "";
  if (cleaned && !isCatalogDumpCaption(cleaned, title)) return cleaned;
  return fallbackInstagramCaption(title, pillar, extra);
}

function captionCta(input: CaptionInput, body: string): string {
  if (/link in bio/i.test(body)) return "";
  if (input.pillar === "graphic" || input.pillar === "world") {
    return INSTAGRAM_MANIFESTO_CTA;
  }
  return INSTAGRAM_LINK_IN_BIO_CTA;
}

/** Feed caption: hook/body, link-in-bio CTA, niche hashtags. No URLs. */
export function buildInstagramCaption(input: CaptionInput): string {
  const body = captionBody(input);
  const tags = sanitizeInstagramHashtags(input.hashtags ?? []);
  const tagLine = tags.map((t) => `#${t}`).join(" ");
  const cta = captionCta(input, body);
  return [body, cta, tagLine]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, INSTAGRAM_CAPTION_MAX);
}

/**
 * Facebook *does* linkify URLs, so the same copy gets a shop line. Hashtag
 * quality bar stays the same — we do not hashtag-dump on either surface.
 */
export function buildFacebookCaption(input: CaptionInput): string {
  const body = captionBody(input);
  const tags = sanitizeInstagramHashtags(input.hashtags ?? []);
  const tagLine = tags.map((t) => `#${t}`).join(" ");
  const shop = input.productUrl?.trim()
    ? `Shop: ${input.productUrl.trim()}`
    : "Shop: https://y2kase.com";
  return [body, tagLine, shop].filter(Boolean).join("\n\n").slice(0, INSTAGRAM_CAPTION_MAX);
}

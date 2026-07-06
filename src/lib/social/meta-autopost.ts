/**
 * Social Studio — autonomous Instagram + Facebook auto-poster (per-listing).
 *
 * Mirrors the Pinterest drip's philosophy but with Meta's content model: each
 * run takes the next un-posted listing and publishes it to every connected Meta
 * surface —
 *   Instagram: one carousel (up to 10 photos) + the video as a Reel
 *   Facebook:  one multi-photo feed post + the video
 * — then records each post so a listing goes to each platform exactly once.
 *
 * Dedup + history reuse `social_creatives`, keyed by (productId, platform,
 * mediaType): 'carousel' for the photo post, 'video' for the Reel/video. Claims
 * are atomic and failures are parked with a retry counter (poison-pill guard),
 * exactly like the Pinterest engine.
 *
 * Production requires Meta App Review; until then these calls only succeed for
 * the app's own admins/testers. The whole drip is gated behind connection +
 * META_AUTOPOST_ENABLED so nothing fires until you're ready.
 */

import { sql } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import {
  getCreativeById,
  updateCreativeCopy,
} from "@/lib/social/creatives";
import { publishCreative } from "@/lib/social/publish";
import { generateCaption } from "@/lib/social/caption-gen";
import { isImageGenConfigured } from "@/lib/social/image-gen";
import {
  getProductGallery,
  PRODUCT_PHOTO_PRESET,
  type ProductGallery,
} from "@/lib/social/product-photos";
import { PRODUCT_VIDEO_PRESET } from "@/lib/social/auto-pin";
import { isMetaConfigured } from "@/lib/social/meta";
import { getToken } from "@/lib/social/token-store";

export type MetaPlatform = "instagram" | "facebook";
type MetaMediaType = "carousel" | "video";

export const META_AUTOPOST_MODEL = "auto-post";

/** Listings posted per run. */
export const META_AUTOPOST_PER_RUN = Math.max(
  1,
  Number(process.env.META_AUTOPOST_PER_RUN ?? 1),
);

export const META_AUTOPOST_MAX_ATTEMPTS = Math.max(
  1,
  Number(process.env.META_AUTOPOST_MAX_ATTEMPTS ?? 3),
);

/** Meta processes video async — space posts out generously. */
const MEDIA_GAP_MS = Math.max(0, Number(process.env.META_AUTOPOST_GAP_MS ?? 3000));

/** Hour (UTC) the daily cron fires — keep in sync with vercel.json. */
export const META_CRON_HOUR_UTC = 16;

export function isMetaAutopostEnabled(): boolean {
  return process.env.META_AUTOPOST_ENABLED === "true";
}

const ACTIVE = sql`('draft','approved','scheduled','published')`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function rows<T>(res: unknown): T[] {
  const r = res as { rows?: T[] } | T[];
  return (Array.isArray(r) ? r : (r.rows ?? [])) as T[];
}

function nextRunAtIso(): string {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), META_CRON_HOUR_UTC, 0, 0, 0),
  );
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Connected platforms
// ─────────────────────────────────────────────────────────────────────────────

/** Which Meta platforms are connected (token + account id present). */
export async function getConnectedPlatforms(): Promise<MetaPlatform[]> {
  if (!isMetaConfigured() || !isDbConfigured()) return [];
  const out: MetaPlatform[] = [];
  try {
    const ig = await getToken("instagram");
    if (ig?.accessToken && ig?.accountId) out.push("instagram");
    const fb = await getToken("facebook");
    if (fb?.accessToken && fb?.accountId) out.push("facebook");
  } catch {
    return [];
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// "Needs posting" predicates
// ─────────────────────────────────────────────────────────────────────────────

/** A (platform, mediaType) post for product `p` is still outstanding. */
function notPosted(platform: MetaPlatform, mediaType: MetaMediaType) {
  return sql`NOT EXISTS (
    SELECT 1 FROM social_creatives sc
    WHERE sc.product_id = p.id
      AND sc.platform = ${platform} AND sc.media_type = ${mediaType}
      AND (
        sc.status IN ${ACTIVE}
        OR (sc.status = 'rejected'
            AND (sc.model <> ${META_AUTOPOST_MODEL} OR sc.attempts >= ${META_AUTOPOST_MAX_ATTEMPTS}))
      )
  )`;
}

/** Product `p` still needs a photo post and/or a video post on `platform`. */
function platformNeeds(platform: MetaPlatform) {
  return sql`(
    (EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id AND pi.url LIKE 'http%')
      AND ${notPosted(platform, "carousel")})
    OR
    (p.video_url LIKE 'http%' AND ${notPosted(platform, "video")})
  )`;
}

function productNeedsMeta(platforms: MetaPlatform[]) {
  const parts = platforms.map((pl) => platformNeeds(pl));
  return sql`(${sql.join(parts, sql` OR `)})`;
}

async function getNextProductId(platforms: MetaPlatform[]): Promise<number | null> {
  if (platforms.length === 0) return null;
  const res = await db.execute<{ id: number }>(sql`
    SELECT p.id FROM products p
    WHERE p.status = 'active' AND ${productNeedsMeta(platforms)}
    ORDER BY p.created_at ASC, p.id ASC
    LIMIT 1
  `);
  return rows<{ id: number }>(res)[0]?.id ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Coverage
// ─────────────────────────────────────────────────────────────────────────────

export type MetaCoverage = {
  connected: MetaPlatform[];
  totalProducts: number;
  postedProducts: number;
  remainingProducts: number;
  igPosts: number;
  fbPosts: number;
  postedToday: number;
  enabled: boolean;
  perRun: number;
};

function startOfUtcDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function getMetaCoverage(): Promise<MetaCoverage> {
  const connected = await getConnectedPlatforms();
  const base: MetaCoverage = {
    connected,
    totalProducts: 0,
    postedProducts: 0,
    remainingProducts: 0,
    igPosts: 0,
    fbPosts: 0,
    postedToday: 0,
    enabled: isMetaAutopostEnabled(),
    perRun: META_AUTOPOST_PER_RUN,
  };
  if (!isDbConfigured()) return base;

  const totalRes = await db.execute<{ total_products: number; ig_posts: number; fb_posts: number; posted_today: number }>(sql`
    SELECT
      (SELECT count(*)::int FROM products p WHERE p.status='active'
        AND (EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id=p.id AND pi.url LIKE 'http%') OR p.video_url LIKE 'http%')) AS total_products,
      (SELECT count(*)::int FROM social_creatives sc WHERE sc.platform='instagram' AND sc.status='published') AS ig_posts,
      (SELECT count(*)::int FROM social_creatives sc WHERE sc.platform='facebook' AND sc.status='published') AS fb_posts,
      (SELECT count(*)::int FROM social_creatives sc WHERE sc.platform IN ('instagram','facebook') AND sc.status='published' AND sc.published_at >= ${startOfUtcDay().toISOString()}) AS posted_today
  `);
  const t = rows<{ total_products: number; ig_posts: number; fb_posts: number; posted_today: number }>(totalRes)[0];

  let remainingProducts = 0;
  if (connected.length > 0) {
    const remRes = await db.execute<{ remaining: number }>(sql`
      SELECT count(*)::int AS remaining FROM products p
      WHERE p.status='active' AND ${productNeedsMeta(connected)}
    `);
    remainingProducts = rows<{ remaining: number }>(remRes)[0]?.remaining ?? 0;
  }

  const totalProducts = t?.total_products ?? 0;
  return {
    ...base,
    totalProducts,
    remainingProducts,
    postedProducts: Math.max(0, totalProducts - remainingProducts),
    igPosts: t?.ig_posts ?? 0,
    fbPosts: t?.fb_posts ?? 0,
    postedToday: t?.posted_today ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Up next preview
// ─────────────────────────────────────────────────────────────────────────────

export type MetaNextPreview = {
  productId: number;
  productTitle: string;
  productSlug: string;
  coverUrl: string | null;
  photoCount: number;
  hasVideo: boolean;
  platforms: MetaPlatform[];
  nextRunAtIso: string;
};

export async function getMetaNextPreview(): Promise<MetaNextPreview | null> {
  const platforms = await getConnectedPlatforms();
  if (platforms.length === 0) return null;
  const productId = await getNextProductId(platforms);
  if (!productId) return null;
  const gallery = await getProductGallery(productId);
  if (!gallery) return null;
  const photos = gallery.photos.filter((p) => /^https?:\/\//.test(p.url));
  return {
    productId: gallery.id,
    productTitle: gallery.title,
    productSlug: gallery.slug,
    coverUrl: photos[0]?.url ?? null,
    photoCount: Math.min(photos.length, 10),
    hasVideo: Boolean(gallery.videoUrl),
    platforms,
    nextRunAtIso: nextRunAtIso(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Claim + park
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Atomically reserve a (product, platform, mediaType) post as a draft creative,
 * or return null if it's already published/in-flight/given-up. Reuses a parked
 * retryable row when present; otherwise inserts a fresh draft.
 */
async function claimMetaCreative(
  gallery: ProductGallery,
  platform: MetaPlatform,
  mediaType: MetaMediaType,
): Promise<number | null> {
  const cover = gallery.photos.find((p) => /^https?:\/\//.test(p.url))?.url ?? gallery.photos[0]?.url ?? "";
  const preset = mediaType === "video" ? PRODUCT_VIDEO_PRESET : PRODUCT_PHOTO_PRESET;
  const videoUrl = mediaType === "video" ? (gallery.videoUrl ?? null) : null;

  const reuse = await db.execute<{ id: number }>(sql`
    UPDATE social_creatives
    SET status='draft', last_error=NULL, product_title=${gallery.title}, product_slug=${gallery.slug},
        image_url=${cover}, video_url=${videoUrl}, media_type=${mediaType}, updated_at=now()
    WHERE id = (
      SELECT id FROM social_creatives
      WHERE product_id=${gallery.id} AND platform=${platform} AND media_type=${mediaType}
        AND model=${META_AUTOPOST_MODEL} AND status='rejected' AND attempts < ${META_AUTOPOST_MAX_ATTEMPTS}
      ORDER BY id LIMIT 1
    )
    RETURNING id
  `);
  const reused = rows<{ id: number }>(reuse)[0]?.id;
  if (reused) return reused;

  const inserted = await db.execute<{ id: number }>(sql`
    INSERT INTO social_creatives
      (product_id, product_title, product_slug, preset, platform, media_type,
       image_url, video_url, prompt, hashtags, status, model, cost_cents)
    SELECT
      ${gallery.id}, ${gallery.title}, ${gallery.slug}, ${preset}, ${platform}, ${mediaType},
      ${cover}, ${videoUrl}, '(auto-posted real product media — no generation)', '{}',
      'draft', ${META_AUTOPOST_MODEL}, 0
    WHERE NOT EXISTS (
      SELECT 1 FROM social_creatives sc
      WHERE sc.product_id=${gallery.id} AND sc.platform=${platform} AND sc.media_type=${mediaType}
    )
    RETURNING id
  `);
  return rows<{ id: number }>(inserted)[0]?.id ?? null;
}

async function parkFailed(id: number): Promise<void> {
  await db.execute(sql`
    UPDATE social_creatives
    SET status='rejected', attempts = attempts + 1, updated_at=now()
    WHERE id = ${id}
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

export type MetaAutopostResult = {
  ok: boolean;
  listingsProcessed: number;
  posted: number;
  failed: number;
  skipped: number;
  reason?: string;
  errors: string[];
  platforms: MetaPlatform[];
};

/**
 * Post the next `max` un-posted listings to every connected Meta platform. One
 * AI caption per listing, reused across posts. Photos then video, per platform.
 */
export async function runMetaAutopost(
  opts: { max?: number } = {},
): Promise<MetaAutopostResult> {
  const maxListings = Math.max(1, opts.max ?? META_AUTOPOST_PER_RUN);
  const result: MetaAutopostResult = {
    ok: true,
    listingsProcessed: 0,
    posted: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    platforms: [],
  };

  if (!isDbConfigured()) return { ...result, ok: false, reason: "no-db" };
  if (!isMetaConfigured()) return { ...result, ok: false, reason: "not-configured" };

  const platforms = await getConnectedPlatforms();
  result.platforms = platforms;
  if (platforms.length === 0) return { ...result, ok: false, reason: "not-connected" };

  for (let n = 0; n < maxListings; n++) {
    const productId = await getNextProductId(platforms);
    if (!productId) {
      if (n === 0) result.reason = "all-posted";
      break;
    }
    const gallery = await getProductGallery(productId);
    if (!gallery) {
      result.skipped++;
      continue;
    }
    result.listingsProcessed++;

    const hasImages = gallery.photos.some((p) => /^https?:\/\//.test(p.url));
    const hasVideo = Boolean(gallery.videoUrl);

    // One caption per listing (best-effort), reused across every post.
    let copy: { caption: string; hashtags: string[] } | null = null;
    if (isImageGenConfigured()) {
      try {
        const generated = await generateCaption({
          productTitle: gallery.title,
          productType: gallery.productType,
          description: gallery.description,
          tags: gallery.tags,
          platform: "instagram",
          preset: PRODUCT_PHOTO_PRESET,
        });
        copy = { caption: generated.caption, hashtags: generated.hashtags };
      } catch (err) {
        console.error("[meta-autopost] caption generation failed:", err);
      }
    }

    // Ordered jobs: for each platform, the photo post then the video post.
    const jobs: Array<{ platform: MetaPlatform; mediaType: MetaMediaType }> = [];
    for (const platform of platforms) {
      if (hasImages) jobs.push({ platform, mediaType: "carousel" });
      if (hasVideo) jobs.push({ platform, mediaType: "video" });
    }

    for (let j = 0; j < jobs.length; j++) {
      const job = jobs[j];
      const creativeId = await claimMetaCreative(gallery, job.platform, job.mediaType);
      if (!creativeId) {
        result.skipped++;
        continue;
      }
      if (copy) {
        try {
          await updateCreativeCopy(creativeId, copy.caption, copy.hashtags);
        } catch (err) {
          console.error("[meta-autopost] caption attach failed:", err);
        }
      }

      const creative = await getCreativeById(creativeId);
      if (!creative) {
        result.failed++;
        result.errors.push(`#${creativeId}: creative vanished after claim.`);
        continue;
      }

      const outcome = await publishCreative(creative, {
        revertToScheduledOnError: false,
      });
      if (outcome.ok) {
        result.posted++;
      } else {
        result.failed++;
        result.errors.push(
          `${gallery.title} — ${job.platform} ${job.mediaType}: ${outcome.error}`,
        );
        try {
          await parkFailed(creativeId);
        } catch {
          /* publish error already recorded */
        }
      }

      if (j < jobs.length - 1 && MEDIA_GAP_MS > 0) await sleep(MEDIA_GAP_MS);
    }
  }

  result.ok = result.failed === 0;
  return result;
}

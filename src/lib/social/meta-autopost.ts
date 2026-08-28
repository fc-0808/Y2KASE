/**
 * Social Studio — autonomous Instagram + Facebook auto-poster.
 *
 * Instagram is not Pinterest. The Pinterest drip publishes a listing's full
 * media set in one go because Pins are a search index. Instagram is a profile
 * a stranger judges in two seconds, so this drip follows the editorial rules
 * in `instagram-strategy.ts`:
 *
 *   - At most one Instagram post per UTC day (env-capped at 2).
 *   - One media type per run — Reel if the listing still has a video, otherwise
 *     a carousel of real catalog photos. Never both the same day.
 *   - Coverage-first product order: SKUs with zero Instagram posts go out
 *     before a second-pass carousel of something already shown. The grid fills
 *     with assortment, not the same case twice.
 *   - AI writes the caption. AI never becomes the image. Publishing always
 *     uses the catalog gallery / product video (see publish.ts).
 *
 * Facebook gets the same piece of content the same day (cross-post). Dedup is
 * still keyed by (productId, platform, mediaType) on `social_creatives`.
 *
 * Production Graph API publishing requires Meta App Review. Until then the
 * Instagram desk is a manual post pack (same ledger) — you post in the app
 * and mark it here. Cron is gated behind connection + META_AUTOPOST_ENABLED.
 */

import { sql } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import {
  getCreativeById,
  updateCreativeCopy,
  insertCreative,
  markPublished,
} from "@/lib/social/creatives";
import { publishCreative } from "@/lib/social/publish";
import { generateCaption, isCaptionGenConfigured } from "@/lib/social/caption-gen";
import {
  getProductGallery,
  PRODUCT_PHOTO_PRESET,
  type ProductGallery,
} from "@/lib/social/product-photos";
import { PRODUCT_VIDEO_PRESET } from "@/lib/social/auto-pin";
import { isMetaConfigured, IG_CAROUSEL_MAX } from "@/lib/social/meta";
import { getToken } from "@/lib/social/token-store";
import {
  bootstrapRemaining,
  buildInstagramCaption,
  describeSlot,
  fallbackInstagramCaption,
  INSTAGRAM_PROFILE_URL,
  instagramPhase,
  instagramPostsPerDay,
  planInstagramSlot,
  type InstagramAccountPhase,
  type InstagramMediaType,
} from "@/lib/social/instagram-strategy";

export type MetaPlatform = "instagram" | "facebook";
type MetaMediaType = "carousel" | "video";

export const META_AUTOPOST_MODEL = "auto-post";
export const MANUAL_POST_MODEL = "manual-post";

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

function startOfUtcDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function primaryPlatform(platforms: MetaPlatform[]): MetaPlatform {
  return platforms.includes("instagram") ? "instagram" : platforms[0];
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

/**
 * Oldest listing that still needs a Meta post, with never-posted SKUs first.
 * Coverage-first keeps a 1-post shop looking like a catalog instead of looping
 * the same hero product.
 */
async function getNextProductId(
  platforms: MetaPlatform[],
  skipIds: ReadonlySet<number> = new Set(),
): Promise<number | null> {
  if (platforms.length === 0) return null;
  const primary = primaryPlatform(platforms);
  const skipClause =
    skipIds.size > 0
      ? sql`AND p.id NOT IN (${sql.join(
          Array.from(skipIds).map((id) => sql`${id}`),
          sql`, `,
        )})`
      : sql``;
  const res = await db.execute<{ id: number }>(sql`
    SELECT p.id FROM products p
    WHERE p.status = 'active' AND ${productNeedsMeta(platforms)} ${skipClause}
    ORDER BY
      CASE WHEN EXISTS (
        SELECT 1 FROM social_creatives sc
        WHERE sc.product_id = p.id
          AND sc.platform = ${primary}
          AND (
            sc.status IN ${ACTIVE}
            OR (sc.status = 'rejected'
                AND (sc.model <> ${META_AUTOPOST_MODEL} OR sc.attempts >= ${META_AUTOPOST_MAX_ATTEMPTS}))
          )
      ) THEN 1 ELSE 0 END ASC,
      p.created_at ASC,
      p.id ASC
    LIMIT 1
  `);
  return rows<{ id: number }>(res)[0]?.id ?? null;
}

async function getPostedMedia(
  productId: number,
  platform: MetaPlatform,
): Promise<{ carousel: boolean; video: boolean }> {
  const res = await db.execute<{ media_type: string }>(sql`
    SELECT DISTINCT sc.media_type
    FROM social_creatives sc
    WHERE sc.product_id = ${productId}
      AND sc.platform = ${platform}
      AND (
        sc.status IN ${ACTIVE}
        OR (sc.status = 'rejected'
            AND (sc.model <> ${META_AUTOPOST_MODEL} OR sc.attempts >= ${META_AUTOPOST_MAX_ATTEMPTS}))
      )
  `);
  const types = new Set(
    rows<{ media_type: string }>(res).map((r) => r.media_type),
  );
  return { carousel: types.has("carousel"), video: types.has("video") };
}

async function countIgPostedToday(): Promise<number> {
  const res = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM social_creatives
    WHERE platform = 'instagram'
      AND status = 'published'
      AND published_at >= ${startOfUtcDay().toISOString()}
  `);
  return rows<{ n: number }>(res)[0]?.n ?? 0;
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
  igPostedToday: number;
  igPostsPerDay: number;
  phase: InstagramAccountPhase;
  bootstrapRemaining: number;
  enabled: boolean;
  perRun: number;
};

export async function getMetaCoverage(): Promise<MetaCoverage> {
  const connected = await getConnectedPlatforms();
  const igPostsPerDay = instagramPostsPerDay();
  const base: MetaCoverage = {
    connected,
    totalProducts: 0,
    postedProducts: 0,
    remainingProducts: 0,
    igPosts: 0,
    fbPosts: 0,
    postedToday: 0,
    igPostedToday: 0,
    igPostsPerDay,
    phase: "bootstrap",
    bootstrapRemaining: bootstrapRemaining(0),
    enabled: isMetaAutopostEnabled(),
    perRun: META_AUTOPOST_PER_RUN,
  };
  if (!isDbConfigured()) return base;

  const since = startOfUtcDay().toISOString();
  const totalRes = await db.execute<{
    total_products: number;
    ig_posts: number;
    fb_posts: number;
    posted_today: number;
    ig_posted_today: number;
  }>(sql`
    SELECT
      (SELECT count(*)::int FROM products p WHERE p.status='active'
        AND (EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id=p.id AND pi.url LIKE 'http%') OR p.video_url LIKE 'http%')) AS total_products,
      (SELECT count(*)::int FROM social_creatives sc WHERE sc.platform='instagram' AND sc.status='published') AS ig_posts,
      (SELECT count(*)::int FROM social_creatives sc WHERE sc.platform='facebook' AND sc.status='published') AS fb_posts,
      (SELECT count(*)::int FROM social_creatives sc WHERE sc.platform IN ('instagram','facebook') AND sc.status='published' AND sc.published_at >= ${since}) AS posted_today,
      (SELECT count(*)::int FROM social_creatives sc WHERE sc.platform='instagram' AND sc.status='published' AND sc.published_at >= ${since}) AS ig_posted_today
  `);
  const t = rows<{
    total_products: number;
    ig_posts: number;
    fb_posts: number;
    posted_today: number;
    ig_posted_today: number;
  }>(totalRes)[0];

  let remainingProducts = 0;
  const planFor: MetaPlatform[] =
    connected.length > 0 ? connected : ["instagram"];
  const remRes = await db.execute<{ remaining: number }>(sql`
    SELECT count(*)::int AS remaining FROM products p
    WHERE p.status='active' AND ${productNeedsMeta(planFor)}
  `);
  remainingProducts = rows<{ remaining: number }>(remRes)[0]?.remaining ?? 0;

  const totalProducts = t?.total_products ?? 0;
  const igPosts = t?.ig_posts ?? 0;
  return {
    ...base,
    totalProducts,
    remainingProducts,
    postedProducts: Math.max(0, totalProducts - remainingProducts),
    igPosts,
    fbPosts: t?.fb_posts ?? 0,
    postedToday: t?.posted_today ?? 0,
    igPostedToday: t?.ig_posted_today ?? 0,
    phase: instagramPhase(igPosts),
    bootstrapRemaining: bootstrapRemaining(igPosts),
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
  plannedMediaType: InstagramMediaType | null;
  plannedReason: string;
  slotUsedToday: boolean;
};

export async function getMetaNextPreview(): Promise<MetaNextPreview | null> {
  const platforms = await getConnectedPlatforms();
  if (platforms.length === 0) return null;
  const productId = await getNextProductId(platforms);
  if (!productId) return null;
  const gallery = await getProductGallery(productId);
  if (!gallery) return null;
  const photos = gallery.photos.filter((p) => /^https?:\/\//.test(p.url));
  const hasPhotos = photos.length > 0;
  const hasVideo = Boolean(gallery.videoUrl);
  const primary = primaryPlatform(platforms);
  const posted = await getPostedMedia(gallery.id, primary);
  const igPostedToday = platforms.includes("instagram")
    ? await countIgPostedToday()
    : 0;
  const dailyCap = instagramPostsPerDay();
  const slotUsedToday =
    platforms.includes("instagram") && igPostedToday >= dailyCap;
  // When today's slot is spent, preview tomorrow's post — not a skip reason.
  const plan = planInstagramSlot({
    hasPhotos,
    hasVideo,
    photosPosted: posted.carousel,
    videoPosted: posted.video,
    igPostedToday: slotUsedToday ? 0 : igPostedToday,
    dailyCap,
  });

  return {
    productId: gallery.id,
    productTitle: gallery.title,
    productSlug: gallery.slug,
    coverUrl: photos[0]?.url ?? null,
    photoCount: Math.min(photos.length, 10),
    hasVideo,
    platforms,
    nextRunAtIso: nextRunAtIso(),
    plannedMediaType: plan.action === "post" ? plan.mediaType : null,
    plannedReason: describeSlot(plan),
    slotUsedToday,
  };
}

export type InstagramDeskSlot = {
  productId: number;
  productTitle: string;
  productSlug: string;
  coverUrl: string | null;
  photoUrls: string[];
  videoUrl: string | null;
  plannedMediaType: InstagramMediaType;
  plannedReason: string;
};

export type InstagramDesk = {
  slot: InstagramDeskSlot | null;
  slotUsedToday: boolean;
  igPostedToday: number;
  igPostsPerDay: number;
  igPosts: number;
  remainingProducts: number;
  phase: InstagramAccountPhase;
  bootstrapRemaining: number;
};

/**
 * Today's Instagram assignment. Does not require META_APP_ID — the desk is a
 * post pack you paste into the Instagram app until Graph API publishing is
 * reviewed. The same coverage-first ledger the cron uses, so marking a post
 * here means the API will not double-post later.
 */
export async function getInstagramDesk(): Promise<InstagramDesk> {
  const igPostsPerDay = instagramPostsPerDay();
  const empty: InstagramDesk = {
    slot: null,
    slotUsedToday: false,
    igPostedToday: 0,
    igPostsPerDay,
    igPosts: 0,
    remainingProducts: 0,
    phase: "bootstrap",
    bootstrapRemaining: bootstrapRemaining(0),
  };
  if (!isDbConfigured()) return empty;

  const igPostedToday = await countIgPostedToday();
  const slotUsedToday = igPostedToday >= igPostsPerDay;

  const statsRes = await db.execute<{ remaining: number; ig_posts: number }>(sql`
    SELECT
      (SELECT count(*)::int FROM products p
        WHERE p.status='active' AND ${productNeedsMeta(["instagram"])}) AS remaining,
      (SELECT count(*)::int FROM social_creatives sc
        WHERE sc.platform='instagram' AND sc.status='published') AS ig_posts
  `);
  const stats = rows<{ remaining: number; ig_posts: number }>(statsRes)[0];
  const igPosts = stats?.ig_posts ?? 0;
  const remainingProducts = stats?.remaining ?? 0;
  const phase = instagramPhase(igPosts);
  const remainingBootstrap = bootstrapRemaining(igPosts);

  const productId = await getNextProductId(["instagram"]);
  if (!productId) {
    return {
      slot: null,
      slotUsedToday,
      igPostedToday,
      igPostsPerDay,
      igPosts,
      remainingProducts,
      phase,
      bootstrapRemaining: remainingBootstrap,
    };
  }

  const gallery = await getProductGallery(productId);
  if (!gallery) {
    return {
      slot: null,
      slotUsedToday,
      igPostedToday,
      igPostsPerDay,
      igPosts,
      remainingProducts,
      phase,
      bootstrapRemaining: remainingBootstrap,
    };
  }

  const photos = gallery.photos
    .map((p) => p.url)
    .filter((u) => /^https?:\/\//.test(u))
    .slice(0, IG_CAROUSEL_MAX);
  const hasPhotos = photos.length > 0;
  const hasVideo = Boolean(gallery.videoUrl);
  const posted = await getPostedMedia(gallery.id, "instagram");
  const plan = planInstagramSlot({
    hasPhotos,
    hasVideo,
    photosPosted: posted.carousel,
    videoPosted: posted.video,
    igPostedToday: slotUsedToday ? 0 : igPostedToday,
    dailyCap: igPostsPerDay,
  });

  const slot: InstagramDeskSlot | null =
    plan.action === "post"
      ? {
          productId: gallery.id,
          productTitle: gallery.title,
          productSlug: gallery.slug,
          coverUrl: photos[0] ?? null,
          photoUrls: photos,
          videoUrl: gallery.videoUrl,
          plannedMediaType: plan.mediaType,
          plannedReason: describeSlot(plan),
        }
      : null;

  return {
    slot,
    slotUsedToday,
    igPostedToday,
    igPostsPerDay,
    igPosts,
    remainingProducts,
    phase,
    bootstrapRemaining: remainingBootstrap,
  };
}

export async function prepareInstagramCaption(productId: number): Promise<{
  caption: string;
  hashtags: string[];
}> {
  const gallery = await getProductGallery(productId);
  if (!gallery) throw new Error("Product not found.");
  const copy = await generateListingCopy(gallery);
  return {
    caption: buildInstagramCaption({
      caption: copy.caption,
      hashtags: copy.hashtags,
      productTitle: gallery.title,
    }),
    hashtags: copy.hashtags,
  };
}

export async function recordManualInstagramPost(input: {
  productId: number;
  mediaType: MetaMediaType;
  caption: string;
  hashtags: string[];
}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  if (!isDbConfigured()) return { ok: false, error: "Database is not configured." };

  const dailyCap = instagramPostsPerDay();
  if ((await countIgPostedToday()) >= dailyCap) {
    return { ok: false, error: "Today's Instagram slot is already used." };
  }

  const gallery = await getProductGallery(input.productId);
  if (!gallery) return { ok: false, error: "Product not found." };

  const photos = gallery.photos.filter((p) => /^https?:\/\//.test(p.url));
  const posted = await getPostedMedia(gallery.id, "instagram");
  if (input.mediaType === "video") {
    if (!gallery.videoUrl) return { ok: false, error: "This listing has no video." };
    if (posted.video) return { ok: false, error: "This Reel is already recorded." };
  } else {
    if (photos.length === 0) return { ok: false, error: "This listing has no photos." };
    if (posted.carousel) return { ok: false, error: "This carousel is already recorded." };
  }

  const cover = photos[0]?.url ?? "";
  const caption = buildInstagramCaption({
    caption: input.caption,
    hashtags: input.hashtags,
    productTitle: gallery.title,
  });

  const id = await insertCreative({
    productId: gallery.id,
    productTitle: gallery.title,
    productSlug: gallery.slug,
    preset: input.mediaType === "video" ? PRODUCT_VIDEO_PRESET : PRODUCT_PHOTO_PRESET,
    platform: "instagram",
    mediaType: input.mediaType,
    imageUrl: cover,
    videoUrl: input.mediaType === "video" ? gallery.videoUrl : null,
    prompt: "(manual Instagram post — real catalog media, posted in the app)",
    caption,
    hashtags: input.hashtags,
    model: MANUAL_POST_MODEL,
    costCents: 0,
  });

  await markPublished(
    id,
    `manual:${gallery.id}:${input.mediaType}:${Date.now()}`,
    INSTAGRAM_PROFILE_URL,
  );
  return { ok: true, id };
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
 * Post the next listing as a single editorial slot: one media type (Reel if
 * available, otherwise carousel) to every connected Meta platform. Honours the
 * Instagram daily cap so a new account cannot double-post by accident.
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

  const dailyCap = instagramPostsPerDay();
  let igPostedToday = platforms.includes("instagram")
    ? await countIgPostedToday()
    : 0;
  const primary = primaryPlatform(platforms);
  const skipIds = new Set<number>();

  for (let n = 0; n < maxListings; n++) {
    if (platforms.includes("instagram") && igPostedToday >= dailyCap) {
      if (n === 0) result.reason = "daily-cap";
      break;
    }

    const productId = await getNextProductId(platforms, skipIds);
    if (!productId) {
      if (n === 0) result.reason = "all-posted";
      break;
    }
    const gallery = await getProductGallery(productId);
    if (!gallery) {
      skipIds.add(productId);
      result.skipped++;
      continue;
    }

    const hasImages = gallery.photos.some((p) => /^https?:\/\//.test(p.url));
    const hasVideo = Boolean(gallery.videoUrl);
    const posted = await getPostedMedia(gallery.id, primary);
    const plan = planInstagramSlot({
      hasPhotos: hasImages,
      hasVideo,
      photosPosted: posted.carousel,
      videoPosted: posted.video,
      igPostedToday,
      dailyCap,
    });

    if (plan.action === "skip") {
      if (plan.reason === "daily-cap") {
        result.reason = "daily-cap";
        break;
      }
      // Primary platform is fully posted; fill leftover media on other
      // surfaces (typically Facebook) without consuming the Instagram slot.
      let fallback: MetaMediaType | null = null;
      for (const platform of platforms) {
        const flags = await getPostedMedia(gallery.id, platform);
        if (hasVideo && !flags.video) {
          fallback = "video";
          break;
        }
        if (hasImages && !flags.carousel) {
          fallback = "carousel";
          break;
        }
      }
      if (!fallback) {
        skipIds.add(gallery.id);
        result.skipped++;
        continue;
      }
      result.listingsProcessed++;
      await publishSlot({
        gallery,
        platforms,
        mediaType: fallback,
        result,
      });
      continue;
    }

    result.listingsProcessed++;
    const slot = await publishSlot({
      gallery,
      platforms,
      mediaType: plan.mediaType,
      result,
    });
    if (slot.postedInstagram) igPostedToday += 1;
  }

  result.ok = result.failed === 0;
  return result;
}

async function generateListingCopy(
  gallery: ProductGallery,
): Promise<{ caption: string; hashtags: string[] }> {
  if (isCaptionGenConfigured()) {
    try {
      const generated = await generateCaption({
        productTitle: gallery.title,
        productType: gallery.productType,
        description: gallery.description,
        tags: gallery.tags,
        platform: "instagram",
        preset: PRODUCT_PHOTO_PRESET,
      });
      return { caption: generated.caption, hashtags: generated.hashtags };
    } catch (err) {
      console.error("[meta-autopost] caption generation failed:", err);
    }
  }
  return { caption: fallbackInstagramCaption(gallery.title), hashtags: [] };
}

async function publishSlot(opts: {
  gallery: ProductGallery;
  platforms: MetaPlatform[];
  mediaType: MetaMediaType;
  result: MetaAutopostResult;
}): Promise<{ posted: number; postedInstagram: boolean }> {
  const { gallery, platforms, mediaType, result } = opts;
  const copy = await generateListingCopy(gallery);
  let posted = 0;
  let postedInstagram = false;

  for (let j = 0; j < platforms.length; j++) {
    const platform = platforms[j];
    const flags = await getPostedMedia(gallery.id, platform);
    if (mediaType === "video" && flags.video) continue;
    if (mediaType === "carousel" && flags.carousel) continue;
    if (mediaType === "video" && !gallery.videoUrl) continue;
    if (
      mediaType === "carousel" &&
      !gallery.photos.some((p) => /^https?:\/\//.test(p.url))
    ) {
      continue;
    }

    const creativeId = await claimMetaCreative(gallery, platform, mediaType);
    if (!creativeId) {
      result.skipped++;
      continue;
    }
    try {
      await updateCreativeCopy(creativeId, copy.caption, copy.hashtags);
    } catch (err) {
      console.error("[meta-autopost] caption attach failed:", err);
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
      posted++;
      if (platform === "instagram") postedInstagram = true;
    } else {
      result.failed++;
      result.errors.push(
        `${gallery.title} — ${platform} ${mediaType}: ${outcome.error}`,
      );
      try {
        await parkFailed(creativeId);
      } catch {
        /* publish error already recorded */
      }
    }

    if (j < platforms.length - 1 && MEDIA_GAP_MS > 0) await sleep(MEDIA_GAP_MS);
  }

  return { posted, postedInstagram };
}

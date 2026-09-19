/**
 * Social Studio — autonomous Pinterest auto-pin drip (curated pins).
 *
 * A quality-first distribution engine. Each run publishes a small number of
 * *fresh, visually distinct pins* — never a whole listing's gallery in one
 * burst. That 2022 "dump every photo" pattern is exactly what TransAct V2
 * demotes: near-duplicate stills, zero save rate, and a feed that looks like
 * a catalog scrape.
 *
 * Why per-pin (vs. per-listing dump)
 * ──────────────────────────────────
 * Pinterest ranks accounts by engagement quality, not upload volume. Five
 * close-ups of the same case in a row train the model to skip this shop.
 * One pin per SKU, a multi-day cooldown, video-first, and 2:3 fresh-pin
 * graphics (see {@link renderFreshPinImage}) is how CASETiFY-tier brands
 * actually merchandise: remaining angles become later fresh pins, not same-day
 * duplicates. Editorial rules live in {@link pinterest-strategy}.
 *
 * What counts as postable media
 * ─────────────────────────────
 * Only *authentic* product photos, plus the product video. The AI hero thumbnail
 * that the thumbnail-review queue promotes to gallery position 0 is excluded —
 * see {@link isPinnablePhoto} for why that exclusion is load-bearing, not just
 * cosmetic. Image pins are wrapped in a 1000×1500 card so Pinterest sees new
 * bytes (fresh-pin signal) while the product stays the hero (Visit Site match).
 *
 * How "pinned" is tracked
 * ───────────────────────
 * Every Pin is a `social_creatives` row:
 *   - image pins link back to the exact `product_images.id` via `sourceImageId`,
 *     and additionally by `imageUrl` — a dual key, because `sourceImageId` is
 *     nulled whenever the underlying image row is replaced (see
 *     {@link imageNeedsPin});
 *   - the video pin is keyed by `productId` + `mediaType = 'video'`.
 * An asset is "spoken for" when it has a pinterest creative in an active state
 * (draft / approved / scheduled / published), so it is never pinned twice.
 * Failed auto attempts are parked as `rejected` and retried on the next run
 * (reusing the same row — never accumulating duplicates). Claims are atomic, so
 * overlapping runs can't double-post.
 */

import { sql } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { NORMALIZED_THUMBNAIL_SOURCE } from "@/lib/db/schema";
import {
  getCreativeById,
  updateCreativeContent,
} from "@/lib/social/creatives";
import { publishCreative } from "@/lib/social/publish";
import {
  generateCaption,
  generateCaptionVariations,
  isCaptionGenConfigured,
  type CaptionVariation,
} from "@/lib/social/caption-gen";
import {
  listBoards,
  isPinterestConfigured,
  type PinterestBoard,
} from "@/lib/social/pinterest";
import { renderFreshPinImage } from "@/lib/social/pin-card";
import {
  isPinCardEnabled,
  pickDiverseImageIndex,
  pinterestPinsPerDay,
  pinterestPinsPerRun,
  pinterestProductCooldownDays,
  planPinSlot,
  promptWithAltText,
  sanitizePinterestCaption,
  sanitizePinterestHashtags,
  sanitizePinterestTitle,
  seasonalSearchHint,
  stripUnmentionedDevices,
} from "@/lib/social/pinterest-strategy";
import {
  ensurePinterestAccessToken,
  isPinterestAuthError,
} from "@/lib/social/pinterest-auth";
import { PRODUCT_PHOTO_PRESET } from "@/lib/social/product-photos";
import { resolveBoardForProduct } from "@/lib/social/board-router";

/** Marks creatives produced by the autonomous drip (vs. manual imports). */
export const AUTO_PIN_MODEL = "auto-pin";

/** Preset key marking a creative sourced from a real product video. */
export const PRODUCT_VIDEO_PRESET = "product_video";

/**
 * How many *pins* a single cron invocation posts. Default 2, hard-capped at 4
 * (see {@link pinterestPinsPerRun}) so one slot cannot dump a listing gallery.
 */
export const AUTO_PIN_PER_RUN = pinterestPinsPerRun();

/**
 * Hard cap on *pins posted per UTC day*, enforced across every run. Default 4
 * (spread across cron slots × up to 2 pins each). This is the single knob for
 * daily volume — raise it only after save rate recovers, and never above the
 * strategy hard cap of 8.
 */
export const AUTO_PIN_PER_DAY = pinterestPinsPerDay();

/** Days a SKU rests after a pin before another pin of it may go out. */
export const AUTO_PIN_PRODUCT_COOLDOWN_DAYS = pinterestProductCooldownDays();

/** Pause between individual media posts (stays under Pinterest write limits). */
const MEDIA_GAP_MS = Math.max(
  0,
  Number(process.env.PINTEREST_AUTOPIN_GAP_MS ?? 1500),
);

/**
 * Hours (UTC) the cron fires — kept in sync with vercel.json
 * (`/api/cron/pinterest-autopin`). Three spread windows (≈ US evening, US
 * morning, and a late-US catch-up) so the day's pins don't post in one burst.
 * Used to show operators when the next pin will go out.
 */
export const AUTO_PIN_CRON_HOURS_UTC = [1, 15, 20];

/** Opt-in flag — automation only runs when explicitly enabled. */
export function isAutoPinEnabled(): boolean {
  return process.env.PINTEREST_AUTOPIN_ENABLED?.trim() === "true";
}

/** ISO timestamp of the nearest upcoming cron run across the scheduled hours. */
function nextRunAtIso(): string {
  const now = new Date();
  const candidates = AUTO_PIN_CRON_HOURS_UTC.map((h) => {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, 0, 0, 0),
    );
    if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 1);
    return d.getTime();
  });
  return new Date(Math.min(...candidates)).toISOString();
}

/** States that mean an asset is already "spoken for" (live or in the pipeline). */
const ACTIVE = sql`('draft','approved','scheduled','published')`;

/**
 * How many times the drip retries a failing asset before giving up on it, so a
 * single un-postable photo/video can never block the daily queue forever.
 */
export const AUTO_PIN_MAX_ATTEMPTS = Math.max(
  1,
  Number(process.env.PINTEREST_AUTOPIN_MAX_ATTEMPTS ?? 3),
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function rows<T>(res: unknown): T[] {
  const r = res as { rows?: T[] } | T[];
  return (Array.isArray(r) ? r : (r.rows ?? [])) as T[];
}

// ─────────────────────────────────────────────────────────────────────────────
// "Needs pinning" predicates (shared by selection, coverage, and loading)
// ─────────────────────────────────────────────────────────────────────────────
//
// An asset no longer needs a pin when it has a pinterest creative that is either
// active (in the pipeline or already published) OR "given up" — i.e. an exhausted
// auto-pin retry, or a creative a human rejected. Centralising this keeps the
// selection, coverage and per-listing loading perfectly consistent.

/**
 * SQL: is the image behind table alias `alias` a pinnable asset?
 *
 * Two exclusions, both deliberate:
 *  - non-HTTP urls (Pinterest can only fetch publicly reachable media);
 *  - the derived AI hero thumbnail. That asset is a white-background crop of a
 *    photo we already pin, so posting it is near-duplicate content Pinterest
 *    suppresses. It is also a *brand-new* product_images row inserted at
 *    position 0 by the thumbnail review queue — so without this filter, a
 *    listing whose real photos are all pinned reads as having exactly one
 *    un-pinned asset, and the drip spends its daily slot posting that thumbnail
 *    alone instead of advancing to the next listing.
 */
function isPinnablePhoto(alias: string) {
  const a = sql.raw(alias);
  return sql`(
    ${a}.url LIKE 'http%'
    AND (${a}.source_filename IS NULL
         OR ${a}.source_filename <> ${NORMALIZED_THUMBNAIL_SOURCE})
  )`;
}

/**
 * SQL: does the image behind table alias `alias` still need a pin?
 *
 * An existing creative claims the image by `source_image_id` **or** by
 * `image_url`. The url is the resilient key: `source_image_id` is set to NULL by
 * its ON DELETE SET NULL constraint whenever the product_images row is replaced
 * (catalog re-ingest, thumbnail re-approval), which would otherwise make an
 * already-published photo look un-pinned and get posted a second time.
 */
function imageNeedsPin(alias: string) {
  const a = sql.raw(alias);
  return sql`NOT EXISTS (
    SELECT 1 FROM social_creatives sc
    WHERE (sc.source_image_id = ${a}.id OR sc.image_url = ${a}.url)
      AND sc.platform = 'pinterest'
      AND (
        sc.status IN ${ACTIVE}
        OR (sc.status = 'rejected'
            AND (sc.model <> ${AUTO_PIN_MODEL} OR sc.attempts >= ${AUTO_PIN_MAX_ATTEMPTS}))
      )
  )`;
}

/** SQL: does the product (referenced by `pidExpr`) still need its video pinned? */
function videoNeedsPin(pidExpr: string) {
  return sql`NOT EXISTS (
    SELECT 1 FROM social_creatives sc
    WHERE sc.product_id = ${sql.raw(pidExpr)}
      AND sc.platform = 'pinterest' AND sc.media_type = 'video'
      AND (
        sc.status IN ${ACTIVE}
        OR (sc.status = 'rejected'
            AND (sc.model <> ${AUTO_PIN_MODEL} OR sc.attempts >= ${AUTO_PIN_MAX_ATTEMPTS}))
      )
  )`;
}

/** SQL: does product alias `p` still have any un-pinned media (photo or video)? */
function productNeedsPinning() {
  return sql`(
    EXISTS (
      SELECT 1 FROM product_images pi
      WHERE pi.product_id = p.id
        AND ${isPinnablePhoto("pi")}
        AND ${imageNeedsPin("pi")}
    )
    OR (
      p.video_url LIKE 'http%'
      AND EXISTS (
        SELECT 1 FROM product_images pi2
        WHERE pi2.product_id = p.id AND ${isPinnablePhoto("pi2")}
      )
      AND ${videoNeedsPin("p.id")}
    )
  )`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Selection — the next un-pinned listing
// ─────────────────────────────────────────────────────────────────────────────

type PinImage = {
  imageId: number;
  url: string;
  altText: string | null;
  position: number;
};

export type NextListing = {
  productId: number;
  productTitle: string;
  productSlug: string;
  productType: string;
  description: string | null;
  tags: string[];
  /**
   * Cover still for the video pin (Pinterest requires one). The listing's first
   * *authentic* photo — never the derived AI thumbnail, so the video's poster
   * frame matches the real product shots around it.
   */
  coverUrl: string | null;
  /** Photos that still need an image pin. */
  images: PinImage[];
  /** Gallery positions already pinned, used to pick a visually distant still. */
  pinnedPositions: number[];
  /** The video URL when the listing has an un-pinned video (else null). */
  videoUrl: string | null;
};

/**
 * Next active listing that still has un-pinned media, is not in product
 * cooldown, and is not in `excludeIds` (already used this run). Video-ready
 * listings sort first so the higher-engagement format gets the slot.
 */
async function getNextEligibleProductId(
  excludeIds: readonly number[] = [],
): Promise<number | null> {
  const cooldownDays = AUTO_PIN_PRODUCT_COOLDOWN_DAYS;
  const excludeClause =
    excludeIds.length > 0
      ? sql`AND p.id NOT IN (${sql.raw(
          excludeIds.map((id) => String(Number(id))).join(","),
        )})`
      : sql``;
  const res = await db.execute<{ id: number }>(sql`
    SELECT p.id
    FROM products p
    WHERE p.status = 'active'
      AND ${productNeedsPinning()}
      ${excludeClause}
      AND NOT EXISTS (
        SELECT 1 FROM social_creatives sc
        WHERE sc.product_id = p.id
          AND sc.platform = 'pinterest'
          AND sc.status = 'published'
          AND sc.published_at >= now() - (${cooldownDays} * interval '1 day')
      )
    ORDER BY
      (p.video_url LIKE 'http%' AND ${videoNeedsPin("p.id")}) DESC,
      p.created_at ASC,
      p.id ASC
    LIMIT 1
  `);
  return rows<{ id: number }>(res)[0]?.id ?? null;
}

/** Load a listing's un-pinned media (photos + video) ready for posting. */
async function loadListing(productId: number): Promise<NextListing | null> {
  const prodRes = await db.execute<{
    id: number;
    title: string;
    slug: string;
    product_type: string;
    description: string | null;
    tags: string[] | null;
    video_url: string | null;
    video_needed: boolean;
  }>(sql`
    SELECT
      p.id, p.title, p.slug, p.product_type, p.description, p.tags, p.video_url,
      (p.video_url LIKE 'http%' AND ${videoNeedsPin("p.id")}) AS video_needed
    FROM products p
    WHERE p.id = ${productId} AND p.status = 'active'
  `);
  const product = rows<{
    id: number;
    title: string;
    slug: string;
    product_type: string;
    description: string | null;
    tags: string[] | null;
    video_url: string | null;
    video_needed: boolean;
  }>(prodRes)[0];
  if (!product) return null;

  const imgRes = await db.execute<{
    id: number;
    url: string;
    alt_text: string | null;
    position: number;
    needs_pin: boolean;
  }>(sql`
    SELECT
      pi.id, pi.url, pi.alt_text, pi.position,
      ${imageNeedsPin("pi")} AS needs_pin
    FROM product_images pi
    WHERE pi.product_id = ${productId} AND ${isPinnablePhoto("pi")}
    ORDER BY pi.position ASC, pi.id ASC
  `);
  const allImages = rows<{
    id: number;
    url: string;
    alt_text: string | null;
    position: number;
    needs_pin: boolean;
  }>(imgRes);

  const coverUrl = allImages[0]?.url ?? null;
  const images: PinImage[] = allImages
    .filter((r) => r.needs_pin)
    .map((r) => ({
      imageId: r.id,
      url: r.url,
      altText: r.alt_text,
      position: r.position,
    }));
  const pinnedPositions = allImages
    .filter((r) => !r.needs_pin)
    .map((r) => r.position);

  const videoUrl =
    product.video_needed && product.video_url && coverUrl
      ? product.video_url
      : null;

  return {
    productId: product.id,
    productTitle: product.title,
    productSlug: product.slug,
    productType: product.product_type,
    description: product.description,
    tags: product.tags ?? [],
    coverUrl,
    images,
    pinnedPositions,
    videoUrl,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Coverage — "X of Y listings pinned"
// ─────────────────────────────────────────────────────────────────────────────

export type AutoPinCoverage = {
  totalProducts: number;
  pinnedProducts: number;
  remainingProducts: number;
  totalMedia: number;
  pinnedMedia: number;
  mediaPinnedToday: number;
  /** Assets the drip gave up on after exhausting retries (need attention). */
  stuckCount: number;
  enabled: boolean;
  /** Pins posted per cron run. */
  perRun: number;
  /** Pins posted per day (the daily cap across all runs). */
  perDay: number;
  /** Days a SKU rests before another pin of it. */
  cooldownDays: number;
};

function startOfUtcDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Number of distinct listings that have had at least one pin published so far
 * today (UTC). Display metric — the volume cap is pin-level, see
 * {@link getPinsPostedToday}.
 */
export async function getListingsPostedToday(): Promise<number> {
  if (!isDbConfigured()) return 0;
  const res = await db.execute<{ n: number }>(sql`
    SELECT count(DISTINCT product_id)::int AS n
    FROM social_creatives
    WHERE platform = 'pinterest' AND status = 'published'
      AND product_id IS NOT NULL
      AND published_at >= ${startOfUtcDay().toISOString()}
  `);
  return rows<{ n: number }>(res)[0]?.n ?? 0;
}

/**
 * Pins published today (UTC) across auto-pin and manual publishes. Drives the
 * per-day cap so volume stays controlled across every cron run and any manual
 * triggers combined.
 */
export async function getPinsPostedToday(): Promise<number> {
  if (!isDbConfigured()) return 0;
  const res = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n
    FROM social_creatives
    WHERE platform = 'pinterest' AND status = 'published'
      AND published_at >= ${startOfUtcDay().toISOString()}
  `);
  return rows<{ n: number }>(res)[0]?.n ?? 0;
}

export async function getAutoPinCoverage(): Promise<AutoPinCoverage> {
  const base: AutoPinCoverage = {
    totalProducts: 0,
    pinnedProducts: 0,
    remainingProducts: 0,
    totalMedia: 0,
    pinnedMedia: 0,
    mediaPinnedToday: 0,
    stuckCount: 0,
    enabled: isAutoPinEnabled(),
    perRun: AUTO_PIN_PER_RUN,
    perDay: AUTO_PIN_PER_DAY,
    cooldownDays: AUTO_PIN_PRODUCT_COOLDOWN_DAYS,
  };
  if (!isDbConfigured()) return base;

  // "remaining" uses the exact same predicate as selection, so the count can
  // never disagree with what the drip will actually pick (exhausted retries and
  // human-rejected assets correctly drop out).
  const res = await db.execute<{
    total_products: number;
    remaining_products: number;
    total_media: number;
    pinned_media: number;
    media_pinned_today: number;
    stuck_count: number;
  }>(sql`
    SELECT
      (
        SELECT count(*)::int FROM products p
        WHERE p.status = 'active'
          AND (
            EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id AND ${isPinnablePhoto("pi")})
            OR p.video_url LIKE 'http%'
          )
      ) AS total_products,
      (
        SELECT count(*)::int FROM products p
        WHERE p.status = 'active' AND ${productNeedsPinning()}
      ) AS remaining_products,
      (
        (SELECT count(*)::int FROM product_images pi JOIN products p ON p.id = pi.product_id AND p.status = 'active' WHERE ${isPinnablePhoto("pi")})
        +
        (SELECT count(*)::int FROM products p WHERE p.status = 'active' AND p.video_url LIKE 'http%')
      ) AS total_media,
      (
        SELECT count(*)::int FROM social_creatives sc
        WHERE sc.platform = 'pinterest' AND sc.status = 'published'
      ) AS pinned_media,
      (
        SELECT count(*)::int FROM social_creatives sc
        WHERE sc.platform = 'pinterest' AND sc.status = 'published'
          AND sc.published_at >= ${startOfUtcDay().toISOString()}
      ) AS media_pinned_today,
      (
        SELECT count(*)::int FROM social_creatives sc
        WHERE sc.platform = 'pinterest' AND sc.model = ${AUTO_PIN_MODEL}
          AND sc.status = 'rejected' AND sc.attempts >= ${AUTO_PIN_MAX_ATTEMPTS}
      ) AS stuck_count
  `);

  const r = rows<{
    total_products: number;
    remaining_products: number;
    total_media: number;
    pinned_media: number;
    media_pinned_today: number;
    stuck_count: number;
  }>(res)[0];
  if (!r) return base;

  const totalProducts = r.total_products ?? 0;
  const remainingProducts = r.remaining_products ?? 0;
  return {
    ...base,
    totalProducts,
    remainingProducts,
    pinnedProducts: Math.max(0, totalProducts - remainingProducts),
    totalMedia: r.total_media ?? 0,
    pinnedMedia: r.pinned_media ?? 0,
    mediaPinnedToday: r.media_pinned_today ?? 0,
    stuckCount: r.stuck_count ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Up next — the listing the drip will post on its next run
// ─────────────────────────────────────────────────────────────────────────────

export type NextListingPreview = {
  productId: number;
  productTitle: string;
  productSlug: string;
  coverUrl: string | null;
  /** Photos still awaiting an image pin. */
  photoCount: number;
  /** Whether the listing has a video still awaiting a video pin. */
  hasVideo: boolean;
  /** Pins this product will contribute on the next run (always 0 or 1). */
  totalPins: number;
  /** `video` or `image` — the slot the drip will actually publish. */
  mediaType: "video" | "image";
  /** Human-readable reason for the slot (admin). */
  slotLabel: string;
  /** Name of the board this listing will post to (topical routing). */
  boardName: string | null;
  /** ISO time of the next scheduled cron run. */
  nextRunAtIso: string;
};

/**
 * A preview of the exact pin the next run will post — the same one
 * {@link runAutoPin} would pick — so operators can see what is going out and
 * when. Returns null when the catalog is posted or every remaining SKU is in
 * cooldown.
 */
export async function getNextListingPreview(): Promise<NextListingPreview | null> {
  if (!isDbConfigured()) return null;
  const productId = await getNextEligibleProductId();
  if (!productId) return null;
  const listing = await loadListing(productId);
  if (!listing) return null;

  const photoCount = listing.images.length;
  const hasVideo = Boolean(listing.videoUrl);
  const plan = planPinSlot({
    hasUnpinnedPhotos: photoCount > 0,
    hasUnpinnedVideo: hasVideo,
    pinsPostedToday: await getPinsPostedToday(),
    dailyCap: AUTO_PIN_PER_DAY,
    productPinnedWithinCooldown: false,
  });
  const mediaType =
    plan.action === "post" ? plan.mediaType : hasVideo ? "video" : "image";
  const slotLabel =
    plan.action === "skip" && plan.reason === "daily-cap"
      ? "Today's pin budget is used — this is first in tomorrow's queue."
      : plan.action === "post"
        ? plan.mediaType === "video"
          ? "Next pin: product video"
          : "Next pin: one distinct still"
        : "Queued";

  // Best-effort: resolve the topical board this listing would route to (for
  // display). Never let a Pinterest hiccup break the admin page.
  let boardName: string | null = null;
  if (isPinterestConfigured()) {
    try {
      const boards = await listBoards();
      const defaultBoardId =
        process.env.PINTEREST_AUTOPIN_BOARD_ID || boards[0]?.id;
      if (defaultBoardId) {
        const rb = await resolveBoardForProduct(
          listing.productId,
          boards,
          defaultBoardId,
        );
        boardName = rb.name;
      }
    } catch {
      boardName = null;
    }
  }

  return {
    productId: listing.productId,
    productTitle: listing.productTitle,
    productSlug: listing.productSlug,
    coverUrl: listing.coverUrl,
    photoCount,
    hasVideo,
    totalPins: plan.action === "post" ? 1 : 0,
    mediaType,
    slotLabel,
    boardName,
    nextRunAtIso: nextRunAtIso(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Posting history — recent listings posted, grouped by listing + day
// ─────────────────────────────────────────────────────────────────────────────

export type PostedListing = {
  productId: number | null;
  productTitle: string | null;
  productSlug: string | null;
  platform: string;
  day: string;
  imageCount: number;
  videoCount: number;
  failedCount: number;
  firstPostedAt: string | null;
  lastPostedAt: string | null;
  sampleUrl: string | null;
  sampleImage: string | null;
};

/**
 * Recent posting history for the admin — one row per listing per platform per
 * day, with the count of photos/videos posted, a sample link, and a thumbnail.
 * Spans every social platform (Pinterest, Instagram, Facebook) so it's the one
 * unified "what went out and when" ledger operators rely on.
 */
export async function getRecentPostedListings(
  limit = 30,
  platform?: string,
): Promise<PostedListing[]> {
  if (!isDbConfigured()) return [];
  const platformClause = platform
    ? sql`AND sc.platform = ${platform}`
    : sql``;
  const res = await db.execute<{
    product_id: number | null;
    product_title: string | null;
    product_slug: string | null;
    platform: string;
    day: string;
    image_count: number;
    video_count: number;
    failed_count: number;
    first_posted_at: string | null;
    last_posted_at: string | null;
    sample_url: string | null;
    sample_image: string | null;
  }>(sql`
    SELECT
      sc.product_id,
      max(sc.product_title) AS product_title,
      max(sc.product_slug) AS product_slug,
      sc.platform,
      to_char(date_trunc('day', sc.published_at), 'YYYY-MM-DD') AS day,
      count(*) FILTER (WHERE sc.media_type IN ('image','carousel'))::int AS image_count,
      count(*) FILTER (WHERE sc.media_type = 'video')::int AS video_count,
      0::int AS failed_count,
      min(sc.published_at) AS first_posted_at,
      max(sc.published_at) AS last_posted_at,
      (array_agg(sc.external_url ORDER BY sc.published_at) FILTER (WHERE sc.external_url IS NOT NULL))[1] AS sample_url,
      (array_agg(sc.image_url ORDER BY sc.published_at))[1] AS sample_image
    FROM social_creatives sc
    WHERE sc.status = 'published'
      AND sc.published_at IS NOT NULL
      ${platformClause}
    GROUP BY sc.product_id, sc.platform, date_trunc('day', sc.published_at)
    ORDER BY max(sc.published_at) DESC
    LIMIT ${limit}
  `);

  return rows<{
    product_id: number | null;
    product_title: string | null;
    product_slug: string | null;
    platform: string;
    day: string;
    image_count: number;
    video_count: number;
    failed_count: number;
    first_posted_at: string | null;
    last_posted_at: string | null;
    sample_url: string | null;
    sample_image: string | null;
  }>(res).map((r) => ({
    productId: r.product_id,
    productTitle: r.product_title,
    productSlug: r.product_slug,
    platform: r.platform,
    day: r.day,
    imageCount: r.image_count ?? 0,
    videoCount: r.video_count ?? 0,
    failedCount: r.failed_count ?? 0,
    firstPostedAt: r.first_posted_at,
    lastPostedAt: r.last_posted_at,
    sampleUrl: r.sample_url,
    sampleImage: r.sample_image,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Claim — atomically reserve a photo / video as a draft creative
// ─────────────────────────────────────────────────────────────────────────────

async function claimImageForPin(
  listing: NextListing,
  image: PinImage,
  boardId: string,
): Promise<number | null> {
  // Reuse a parked (rejected) auto-pin row for this image that still has retries
  // left — keeps the attempt counter so the poison-pill guard can eventually
  // give up. Exhausted rows are left alone (never reused, never re-inserted).
  // Re-anchors source_image_id, so a row orphaned by a re-ingest heals itself.
  const reuse = await db.execute<{ id: number }>(sql`
    UPDATE social_creatives
    SET status = 'draft', last_error = NULL, board_id = ${boardId},
        product_id = ${listing.productId}, source_image_id = ${image.imageId},
        product_title = ${listing.productTitle}, product_slug = ${listing.productSlug},
        image_url = ${image.url}, media_type = 'image', video_url = NULL, updated_at = now()
    WHERE id = (
      SELECT id FROM social_creatives
      WHERE (source_image_id = ${image.imageId} OR image_url = ${image.url})
        AND platform = 'pinterest' AND model = ${AUTO_PIN_MODEL}
        AND status = 'rejected' AND attempts < ${AUTO_PIN_MAX_ATTEMPTS}
      ORDER BY id LIMIT 1
    )
    RETURNING id
  `);
  const reused = rows<{ id: number }>(reuse)[0]?.id;
  if (reused) return reused;

  // Insert a fresh draft only when no pinterest creative exists for this image
  // at all (any status) — reuse already handled retryable rows, and rows that
  // are published/in-pipeline or given-up must not be duplicated. Matching the
  // url as well as the id keeps that guarantee across product_images row churn.
  const inserted = await db.execute<{ id: number }>(sql`
    INSERT INTO social_creatives
      (product_id, product_title, product_slug, source_image_id, preset,
       platform, media_type, image_url, prompt, hashtags, status, model, cost_cents, board_id)
    SELECT
      ${listing.productId}, ${listing.productTitle}, ${listing.productSlug},
      ${image.imageId}, ${PRODUCT_PHOTO_PRESET}, 'pinterest', 'image', ${image.url},
      ${promptWithAltText(image.altText)}, '{}', 'draft',
      ${AUTO_PIN_MODEL}, 0, ${boardId}
    WHERE NOT EXISTS (
      SELECT 1 FROM social_creatives sc
      WHERE sc.platform = 'pinterest'
        AND (sc.source_image_id = ${image.imageId} OR sc.image_url = ${image.url})
    )
    RETURNING id
  `);
  return rows<{ id: number }>(inserted)[0]?.id ?? null;
}

async function claimVideoForPin(
  listing: NextListing,
  boardId: string,
): Promise<number | null> {
  if (!listing.videoUrl || !listing.coverUrl) return null;

  const reuse = await db.execute<{ id: number }>(sql`
    UPDATE social_creatives
    SET status = 'draft', last_error = NULL, board_id = ${boardId},
        product_title = ${listing.productTitle}, product_slug = ${listing.productSlug},
        image_url = ${listing.coverUrl}, media_type = 'video', video_url = ${listing.videoUrl},
        updated_at = now()
    WHERE id = (
      SELECT id FROM social_creatives
      WHERE product_id = ${listing.productId}
        AND platform = 'pinterest' AND media_type = 'video'
        AND model = ${AUTO_PIN_MODEL} AND status = 'rejected'
        AND attempts < ${AUTO_PIN_MAX_ATTEMPTS}
      ORDER BY id LIMIT 1
    )
    RETURNING id
  `);
  const reused = rows<{ id: number }>(reuse)[0]?.id;
  if (reused) return reused;

  const inserted = await db.execute<{ id: number }>(sql`
    INSERT INTO social_creatives
      (product_id, product_title, product_slug, source_image_id, preset,
       platform, media_type, image_url, video_url, prompt, hashtags, status, model, cost_cents, board_id)
    SELECT
      ${listing.productId}, ${listing.productTitle}, ${listing.productSlug},
      NULL, ${PRODUCT_VIDEO_PRESET}, 'pinterest', 'video', ${listing.coverUrl},
      ${listing.videoUrl}, '(auto-pinned real product video — no generation)', '{}',
      'draft', ${AUTO_PIN_MODEL}, 0, ${boardId}
    WHERE NOT EXISTS (
      SELECT 1 FROM social_creatives sc
      WHERE sc.product_id = ${listing.productId}
        AND sc.platform = 'pinterest' AND sc.media_type = 'video'
    )
    RETURNING id
  `);
  return rows<{ id: number }>(inserted)[0]?.id ?? null;
}

/**
 * Park a failed asset as rejected. Auth failures do **not** increment
 * `attempts` — they are systemic (token), not asset-specific, and must not
 * burn the poison-pill budget during an outage.
 */
async function parkFailedCreative(
  id: number,
  opts: { countAttempt?: boolean } = {},
): Promise<void> {
  const countAttempt = opts.countAttempt !== false;
  if (countAttempt) {
    await db.execute(sql`
      UPDATE social_creatives
      SET status = 'rejected', attempts = attempts + 1, updated_at = now()
      WHERE id = ${id}
    `);
  } else {
    await db.execute(sql`
      UPDATE social_creatives
      SET status = 'rejected', updated_at = now()
      WHERE id = ${id}
    `);
  }
}

/**
 * After a successful token refresh, reopen auto-pin rows that were rejected
 * solely because of auth failures (including ones that hit the attempt cap).
 * Resets `attempts` so the drip can finish the listings that stalled during
 * the outage instead of permanently skipping them.
 */
export async function recoverAuthFailedAutoPins(): Promise<number> {
  if (!isDbConfigured()) return 0;
  const res = await db.execute<{ id: number }>(sql`
    UPDATE social_creatives
    SET attempts = 0, last_error = NULL, updated_at = now()
    WHERE platform = 'pinterest'
      AND model = ${AUTO_PIN_MODEL}
      AND status = 'rejected'
      AND (
        last_error ILIKE '%Authentication failed%'
        OR last_error ILIKE '%API 401%'
        OR last_error ILIKE '%unauthorized%'
        OR last_error ILIKE '%invalid access token%'
      )
    RETURNING id
  `);
  return rows<{ id: number }>(res).length;
}

/**
 * Reclaim auto-pin rows left in `draft` / `approved` by a mid-run timeout or
 * crash. Those statuses are treated as "spoken for", so without this a killed
 * Vercel invocation permanently blocks the listing. Park them as rejected
 * (without burning an attempt) so the next run can reuse the claim.
 */
async function reclaimStaleAutoPinClaims(): Promise<number> {
  if (!isDbConfigured()) return 0;
  const res = await db.execute<{ id: number }>(sql`
    UPDATE social_creatives
    SET status = 'rejected',
        last_error = coalesce(last_error, 'Reclaimed after stale claim (run interrupted).'),
        updated_at = now()
    WHERE platform = 'pinterest'
      AND model = ${AUTO_PIN_MODEL}
      AND status IN ('draft', 'approved')
      AND updated_at < now() - interval '30 minutes'
    RETURNING id
  `);
  return rows<{ id: number }>(res).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Board resolution
// ─────────────────────────────────────────────────────────────────────────────

async function resolveBoardId(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const fromEnv = process.env.PINTEREST_AUTOPIN_BOARD_ID;
  if (fromEnv) return fromEnv;
  const boards = await listBoards();
  if (boards.length === 0) {
    throw new Error(
      "No Pinterest boards found. Create a board, or set PINTEREST_AUTOPIN_BOARD_ID.",
    );
  }
  return boards[0].id;
}

type PinJob = { kind: "image"; image: PinImage } | { kind: "video" };

function pickSlotJob(listing: NextListing): PinJob | null {
  const plan = planPinSlot({
    hasUnpinnedPhotos: listing.images.length > 0,
    hasUnpinnedVideo: Boolean(listing.videoUrl),
    pinsPostedToday: 0,
    dailyCap: AUTO_PIN_PER_DAY,
    productPinnedWithinCooldown: false,
  });
  if (plan.action !== "post") return null;
  if (plan.mediaType === "video") return { kind: "video" };
  const idx = pickDiverseImageIndex(
    listing.images.map((img) => img.position),
    listing.pinnedPositions,
  );
  const image = listing.images[idx];
  return image ? { kind: "image", image } : null;
}

function sanitizeVariation(
  raw: CaptionVariation,
  productTitle: string,
): CaptionVariation {
  const title = sanitizePinterestTitle(
    stripUnmentionedDevices(raw.title, productTitle),
    productTitle,
  );
  return {
    title,
    caption: sanitizePinterestCaption(raw.caption),
    hashtags: sanitizePinterestHashtags(raw.hashtags),
  };
}

async function generatePinCopy(
  listing: NextListing,
  job: PinJob,
): Promise<CaptionVariation | null> {
  if (!isCaptionGenConfigured()) return null;
  const base =
    job.kind === "video"
      ? "This pin is a product video. Title is a real search phrase for the clip (unboxing, 360, in-hand). Do not invent device models that are not in the product title."
      : "This pin is a single still. Title is a real Pinterest search phrase a shopper would type. Do not invent device models that are not in the product title.";
  const extra = `${base}${seasonalSearchHint()}`;
  try {
    const variations = await generateCaptionVariations({
      productTitle: listing.productTitle,
      productType: listing.productType,
      description: listing.description,
      tags: listing.tags,
      count: 1,
      extra,
    });
    if (variations[0]) {
      return sanitizeVariation(variations[0], listing.productTitle);
    }
  } catch (err) {
    console.error("[auto-pin] caption variations failed:", err);
  }
  try {
    const c = await generateCaption({
      productTitle: listing.productTitle,
      productType: listing.productType,
      description: listing.description,
      tags: listing.tags,
      platform: "pinterest",
      preset: PRODUCT_PHOTO_PRESET,
      extra,
    });
    return sanitizeVariation(
      { title: listing.productTitle, caption: c.caption, hashtags: c.hashtags },
      listing.productTitle,
    );
  } catch {
    return null;
  }
}

async function renderPinCardUrl(
  listing: NextListing,
  image: PinImage,
  overlayTitle: string,
): Promise<string | undefined> {
  if (!isPinCardEnabled()) return undefined;
  try {
    const url = await renderFreshPinImage({
      sourceImageUrl: image.url,
      overlayTitle: overlayTitle || listing.productTitle,
      productId: listing.productId,
      sourceImageId: image.imageId,
    });
    return url ?? undefined;
  } catch (err) {
    console.error(
      "[auto-pin] pin card failed — publishing the catalog photo instead:",
      err,
    );
    return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Run — the orchestration entrypoint
// ─────────────────────────────────────────────────────────────────────────────

export type PostedListingSummary = {
  productTitle: string;
  images: number;
  videos: number;
  failed: number;
};

export type AutoPinResult = {
  ok: boolean;
  /** Listings that had at least one asset attempted this run. */
  listingsProcessed: number;
  /** Individual assets successfully pinned (photos + videos). */
  mediaPinned: number;
  failed: number;
  skipped: number;
  boardId: string | null;
  reason?: string;
  errors: string[];
  listings: PostedListingSummary[];
};

/**
 * Post the next `max` curated pins to Pinterest. Each pin is one asset from a
 * different listing (video preferred), never a gallery dump. A short pause
 * between posts keeps us under Pinterest's write rate limit.
 */
export async function runAutoPin(
  opts: { max?: number; boardId?: string; dailyCap?: number } = {},
): Promise<AutoPinResult> {
  let maxPins = Math.max(1, opts.max ?? AUTO_PIN_PER_RUN);
  const result: AutoPinResult = {
    ok: true,
    listingsProcessed: 0,
    mediaPinned: 0,
    failed: 0,
    skipped: 0,
    boardId: null,
    errors: [],
    listings: [],
  };

  if (!isDbConfigured()) return { ...result, ok: false, reason: "no-db" };
  if (!isPinterestConfigured()) {
    return { ...result, ok: false, reason: "no-pinterest-token" };
  }

  // Ensure a live access token *before* claiming assets. Without this gate,
  // an expired token claims every photo in a listing, burns retries on 401s,
  // and permanently parks healthy media as "stuck".
  const token = await ensurePinterestAccessToken();
  if (!token.ok) {
    return {
      ...result,
      ok: false,
      reason: "auth-failed",
      errors: [token.message],
    };
  }
  if (token.refreshed) {
    // Token just came back — reopen assets poisoned by the prior 401 outage
    // so catalog coverage resumes instead of skipping exhausted listings.
    try {
      const recovered = await recoverAuthFailedAutoPins();
      if (recovered > 0) {
        console.info(
          `[auto-pin] Recovered ${recovered} auth-failed creative(s) after token refresh.`,
        );
      }
    } catch (err) {
      console.error("[auto-pin] auth recovery failed:", err);
    }
  } else {
    // Even without a refresh this run, clear residual auth rejects when the
    // token is healthy again (e.g. refreshed by the daily cron moments earlier).
    try {
      await recoverAuthFailedAutoPins();
    } catch {
      /* best-effort */
    }
  }

  try {
    const reclaimed = await reclaimStaleAutoPinClaims();
    if (reclaimed > 0) {
      console.info(
        `[auto-pin] Reclaimed ${reclaimed} stale draft/approved claim(s).`,
      );
    }
  } catch (err) {
    console.error("[auto-pin] stale claim reclaim failed:", err);
  }

  let postedToday = await getPinsPostedToday();
  const dailyCap = opts.dailyCap ?? AUTO_PIN_PER_DAY;
  const allowed = Math.max(0, dailyCap - postedToday);
  if (allowed <= 0) {
    return { ...result, reason: "daily-cap-reached" };
  }
  maxPins = Math.min(maxPins, allowed);

  let defaultBoardId: string;
  try {
    defaultBoardId = await resolveBoardId(opts.boardId);
  } catch (err) {
    return {
      ...result,
      ok: false,
      reason: "no-board",
      errors: [err instanceof Error ? err.message : "Could not resolve board."],
    };
  }
  result.boardId = defaultBoardId;

  // Fetch the board list once per run for topical routing (best-effort — falls
  // back to the default board if the list can't be loaded). When an explicit
  // board is forced by the caller, routing is bypassed entirely.
  let boards: PinterestBoard[] = [];
  if (!opts.boardId) {
    try {
      boards = await listBoards();
    } catch {
      boards = [];
    }
  }

  const usedProductIds: number[] = [];

  for (let n = 0; n < maxPins; n++) {
    if (postedToday >= dailyCap) {
      if (n === 0) result.reason = "daily-cap-reached";
      break;
    }

    const productId = await getNextEligibleProductId(usedProductIds);
    if (!productId) {
      if (n === 0) result.reason = "all-pinned";
      break;
    }
    usedProductIds.push(productId);

    const listing = await loadListing(productId);
    if (!listing || (listing.images.length === 0 && !listing.videoUrl)) {
      result.skipped++;
      continue;
    }

    const job = pickSlotJob(listing);
    if (!job) {
      result.skipped++;
      continue;
    }

    const boardId = opts.boardId
      ? defaultBoardId
      : (await resolveBoardForProduct(listing.productId, boards, defaultBoardId))
          .id;

    result.listingsProcessed++;
    const summary: PostedListingSummary = {
      productTitle: listing.productTitle,
      images: 0,
      videos: 0,
      failed: 0,
    };

    const copy = await generatePinCopy(listing, job);
    const creativeId =
      job.kind === "image"
        ? await claimImageForPin(listing, job.image, boardId)
        : await claimVideoForPin(listing, boardId);

    if (!creativeId) {
      result.skipped++;
      continue;
    }

    if (copy) {
      try {
        await updateCreativeContent(creativeId, {
          title: copy.title,
          caption: copy.caption,
          hashtags: copy.hashtags,
        });
      } catch (err) {
        console.error("[auto-pin] failed to attach copy:", err);
      }
    }

    let imageUrlOverride: string | undefined;
    if (job.kind === "image") {
      imageUrlOverride = await renderPinCardUrl(
        listing,
        job.image,
        copy?.title || listing.productTitle,
      );
    }

    const creative = await getCreativeById(creativeId);
    if (!creative) {
      result.failed++;
      summary.failed++;
      result.errors.push(`#${creativeId}: creative vanished after claim.`);
      result.listings.push(summary);
      continue;
    }

    const outcome = await publishCreative(creative, {
      boardId,
      revertToScheduledOnError: false,
      imageUrlOverride,
    });

    if (outcome.ok) {
      result.mediaPinned++;
      postedToday++;
      if (job.kind === "image") summary.images++;
      else summary.videos++;
    } else {
      result.failed++;
      summary.failed++;
      const label =
        job.kind === "image" ? `image ${job.image.imageId}` : "video";
      result.errors.push(`${listing.productTitle} — ${label}: ${outcome.error}`);
      const authFail = isPinterestAuthError(outcome.error);
      try {
        await parkFailedCreative(creativeId, { countAttempt: !authFail });
      } catch {
        /* publish error already recorded on the row */
      }
      if (authFail) {
        result.listings.push(summary);
        result.ok = false;
        result.reason = "auth-failed";
        return result;
      }
    }

    result.listings.push(summary);
    if (n < maxPins - 1 && MEDIA_GAP_MS > 0) await sleep(MEDIA_GAP_MS);
  }

  result.ok = result.failed === 0;
  return result;
}

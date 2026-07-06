/**
 * Social Studio — autonomous Pinterest auto-pin drip (per-listing).
 *
 * The "set-and-forget" catalog distribution engine. Every run it takes the next
 * un-pinned *listing* and publishes ALL of its media in one go — every product
 * photo as an image pin, plus the product video as a video pin — then records
 * each asset as pinned. So each listing becomes a complete set of Pins over
 * time, one listing per day, with zero manual work and no duplicates.
 *
 * Why per-listing (vs. per-photo)
 * ───────────────────────────────
 * A shopper who discovers one strong photo of a product should be able to swipe
 * through the whole story — every angle plus the video. Posting a listing's full
 * media set together mirrors how the product appears on-site and how top DTC
 * brands merchandise on Pinterest, while the daily cadence keeps the account's
 * fresh-pin signal high (which the algorithm rewards).
 *
 * How "pinned" is tracked
 * ───────────────────────
 * Every Pin is a `social_creatives` row:
 *   - image pins link back to the exact `product_images.id` via `sourceImageId`;
 *   - the video pin is keyed by `productId` + `mediaType = 'video'`.
 * An asset is "spoken for" when it has a pinterest creative in an active state
 * (draft / approved / scheduled / published), so it is never pinned twice.
 * Failed auto attempts are parked as `rejected` and retried on the next run
 * (reusing the same row — never accumulating duplicates). Claims are atomic, so
 * overlapping runs can't double-post.
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
  listBoards,
  isPinterestConfigured,
  type PinterestBoard,
} from "@/lib/social/pinterest";
import { PRODUCT_PHOTO_PRESET } from "@/lib/social/product-photos";
import { resolveBoardForProduct } from "@/lib/social/board-router";

/** Marks creatives produced by the autonomous drip (vs. manual imports). */
export const AUTO_PIN_MODEL = "auto-pin";

/** Preset key marking a creative sourced from a real product video. */
export const PRODUCT_VIDEO_PRESET = "product_video";

/**
 * How many *listings* a single cron invocation posts. Kept at 1 so the daily
 * volume is spread across multiple runs (see AUTO_PIN_CRON_HOURS_UTC) rather
 * than dumped in one burst — Pinterest rewards steady activity over spikes.
 */
export const AUTO_PIN_PER_RUN = Math.max(
  1,
  Number(process.env.PINTEREST_AUTOPIN_PER_RUN ?? 1),
);

/**
 * Hard cap on *listings posted per UTC day*, enforced across every run. This is
 * the single knob that controls daily volume: raise it (and add matching cron
 * slots) to post more listings/day, e.g. 2 to accelerate catalog coverage. A
 * listing is ~8–14 pins, so 2/day ≈ 20–28 fresh pins/day. Defaults to the
 * per-run count for backward compatibility.
 */
export const AUTO_PIN_PER_DAY = Math.max(
  AUTO_PIN_PER_RUN,
  Number(process.env.PINTEREST_AUTOPIN_PER_DAY ?? AUTO_PIN_PER_RUN),
);

/** Pause between individual media posts (stays under Pinterest write limits). */
const MEDIA_GAP_MS = Math.max(
  0,
  Number(process.env.PINTEREST_AUTOPIN_GAP_MS ?? 1500),
);

/**
 * Hours (UTC) the cron fires — kept in sync with vercel.json
 * (`/api/cron/pinterest-autopin`). Two spread peak windows (≈ US evening and
 * US morning) so the day's listings don't post in one burst. Used to show
 * operators when the next listing will go out.
 */
export const AUTO_PIN_CRON_HOURS_UTC = [1, 15];

/** Opt-in flag — automation only runs when explicitly enabled. */
export function isAutoPinEnabled(): boolean {
  return process.env.PINTEREST_AUTOPIN_ENABLED === "true";
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

/** SQL: does the image (referenced by `imgIdExpr`) still need a pin? */
function imageNeedsPin(imgIdExpr: string) {
  return sql`NOT EXISTS (
    SELECT 1 FROM social_creatives sc
    WHERE sc.source_image_id = ${sql.raw(imgIdExpr)}
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
      WHERE pi.product_id = p.id AND pi.url LIKE 'http%'
        AND ${imageNeedsPin("pi.id")}
    )
    OR (
      p.video_url LIKE 'http%'
      AND EXISTS (SELECT 1 FROM product_images pi2 WHERE pi2.product_id = p.id AND pi2.url LIKE 'http%')
      AND ${videoNeedsPin("p.id")}
    )
  )`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Selection — the next un-pinned listing
// ─────────────────────────────────────────────────────────────────────────────

type PinImage = { imageId: number; url: string; altText: string | null };

export type NextListing = {
  productId: number;
  productTitle: string;
  productSlug: string;
  productType: string;
  description: string | null;
  tags: string[];
  /** Cover thumbnail (the listing's hero image) — required for a video pin. */
  coverUrl: string | null;
  /** Photos that still need an image pin. */
  images: PinImage[];
  /** The video URL when the listing has an un-pinned video (else null). */
  videoUrl: string | null;
};

/**
 * The id of the next active listing that still has un-pinned media, oldest
 * first. A listing qualifies when it has an un-pinned photo, or an un-pinned
 * video *and* at least one photo to use as the required cover.
 */
async function getNextUnpinnedProductId(): Promise<number | null> {
  const res = await db.execute<{ id: number }>(sql`
    SELECT p.id
    FROM products p
    WHERE p.status = 'active'
      AND ${productNeedsPinning()}
    ORDER BY p.created_at ASC, p.id ASC
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
    needs_pin: boolean;
  }>(sql`
    SELECT
      pi.id, pi.url, pi.alt_text,
      ${imageNeedsPin("pi.id")} AS needs_pin
    FROM product_images pi
    WHERE pi.product_id = ${productId} AND pi.url LIKE 'http%'
    ORDER BY pi.position ASC, pi.id ASC
  `);
  const allImages = rows<{
    id: number;
    url: string;
    alt_text: string | null;
    needs_pin: boolean;
  }>(imgRes);

  const coverUrl = allImages[0]?.url ?? null;
  const images: PinImage[] = allImages
    .filter((r) => r.needs_pin)
    .map((r) => ({ imageId: r.id, url: r.url, altText: r.alt_text }));

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
  /** Listings posted per cron run. */
  perRun: number;
  /** Listings posted per day (the daily cap across all runs). */
  perDay: number;
};

function startOfUtcDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Number of distinct listings that have had at least one pin published so far
 * today (UTC). Drives the per-day cap so volume stays controlled across every
 * cron run and any manual triggers combined.
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
            EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id AND pi.url LIKE 'http%')
            OR p.video_url LIKE 'http%'
          )
      ) AS total_products,
      (
        SELECT count(*)::int FROM products p
        WHERE p.status = 'active' AND ${productNeedsPinning()}
      ) AS remaining_products,
      (
        (SELECT count(*)::int FROM product_images pi JOIN products p ON p.id = pi.product_id AND p.status = 'active' WHERE pi.url LIKE 'http%')
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
  /** Total pins that will be created for this listing (photos + video). */
  totalPins: number;
  /** Name of the board this listing will post to (topical routing). */
  boardName: string | null;
  /** ISO time of the next scheduled cron run. */
  nextRunAtIso: string;
};

/**
 * A preview of the exact listing the next run will post — the same one
 * {@link runAutoPin} would pick — with its media breakdown, so operators can see
 * what is going out and when. Returns null when the whole catalog is posted.
 */
export async function getNextListingPreview(): Promise<NextListingPreview | null> {
  if (!isDbConfigured()) return null;
  const productId = await getNextUnpinnedProductId();
  if (!productId) return null;
  const listing = await loadListing(productId);
  if (!listing) return null;

  const photoCount = listing.images.length;
  const hasVideo = Boolean(listing.videoUrl);

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
    totalPins: photoCount + (hasVideo ? 1 : 0),
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
): Promise<PostedListing[]> {
  if (!isDbConfigured()) return [];
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
  const reuse = await db.execute<{ id: number }>(sql`
    UPDATE social_creatives
    SET status = 'draft', last_error = NULL, board_id = ${boardId},
        product_title = ${listing.productTitle}, product_slug = ${listing.productSlug},
        image_url = ${image.url}, media_type = 'image', video_url = NULL, updated_at = now()
    WHERE id = (
      SELECT id FROM social_creatives
      WHERE source_image_id = ${image.imageId}
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
  // are published/in-pipeline or given-up must not be duplicated.
  const inserted = await db.execute<{ id: number }>(sql`
    INSERT INTO social_creatives
      (product_id, product_title, product_slug, source_image_id, preset,
       platform, media_type, image_url, prompt, hashtags, status, model, cost_cents, board_id)
    SELECT
      ${listing.productId}, ${listing.productTitle}, ${listing.productSlug},
      ${image.imageId}, ${PRODUCT_PHOTO_PRESET}, 'pinterest', 'image', ${image.url},
      '(auto-pinned real product photo — no generation)', '{}', 'draft',
      ${AUTO_PIN_MODEL}, 0, ${boardId}
    WHERE NOT EXISTS (
      SELECT 1 FROM social_creatives sc
      WHERE sc.source_image_id = ${image.imageId} AND sc.platform = 'pinterest'
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

/** Park a failed asset as rejected and bump its retry counter (poison-pill). */
async function parkFailedCreative(id: number): Promise<void> {
  await db.execute(sql`
    UPDATE social_creatives
    SET status = 'rejected', attempts = attempts + 1, updated_at = now()
    WHERE id = ${id}
  `);
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
 * Post the next `max` un-pinned listings to Pinterest — every photo as an image
 * pin plus the video as a video pin — recording each asset as pinned. One AI
 * caption is generated per listing and reused across its assets. A short pause
 * between posts keeps us under Pinterest's write rate limit.
 */
export async function runAutoPin(
  opts: { max?: number; boardId?: string; dailyCap?: number } = {},
): Promise<AutoPinResult> {
  let maxListings = Math.max(1, opts.max ?? AUTO_PIN_PER_RUN);
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

  // Enforce the per-day cap across all runs (cron slots + manual triggers): if
  // today's quota is already met, stop; otherwise only post the remainder.
  if (opts.dailyCap != null) {
    const postedToday = await getListingsPostedToday();
    const allowed = Math.max(0, opts.dailyCap - postedToday);
    if (allowed <= 0) {
      return { ...result, reason: "daily-cap-reached" };
    }
    maxListings = Math.min(maxListings, allowed);
  }

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

  for (let n = 0; n < maxListings; n++) {
    const productId = await getNextUnpinnedProductId();
    if (!productId) {
      if (n === 0) result.reason = "all-pinned";
      break;
    }
    const listing = await loadListing(productId);
    if (!listing || (listing.images.length === 0 && !listing.videoUrl)) {
      // Nothing postable (shouldn't happen given the selection) — skip on.
      result.skipped++;
      continue;
    }

    // Route this listing to its most relevant board (character/brand), falling
    // back to the default board.
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

    // One AI caption per listing, reused across all its assets (best-effort).
    let copy: { caption: string; hashtags: string[] } | null = null;
    if (isImageGenConfigured()) {
      try {
        const generated = await generateCaption({
          productTitle: listing.productTitle,
          productType: listing.productType,
          description: listing.description,
          tags: listing.tags,
          platform: "pinterest",
          preset: PRODUCT_PHOTO_PRESET,
        });
        copy = { caption: generated.caption, hashtags: generated.hashtags };
      } catch (err) {
        console.error("[auto-pin] caption generation failed:", err);
      }
    }

    // Build the ordered work list: every photo, then the video.
    type Job =
      | { kind: "image"; image: PinImage }
      | { kind: "video" };
    const jobs: Job[] = [
      ...listing.images.map((image) => ({ kind: "image" as const, image })),
      ...(listing.videoUrl ? [{ kind: "video" as const }] : []),
    ];

    for (let j = 0; j < jobs.length; j++) {
      const job = jobs[j];
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
          await updateCreativeCopy(creativeId, copy.caption, copy.hashtags);
        } catch (err) {
          console.error("[auto-pin] failed to attach caption:", err);
        }
      }

      const creative = await getCreativeById(creativeId);
      if (!creative) {
        result.failed++;
        summary.failed++;
        result.errors.push(`#${creativeId}: creative vanished after claim.`);
        continue;
      }

      const outcome = await publishCreative(creative, {
        boardId,
        revertToScheduledOnError: false,
      });

      if (outcome.ok) {
        result.mediaPinned++;
        if (job.kind === "image") summary.images++;
        else summary.videos++;
      } else {
        result.failed++;
        summary.failed++;
        const label =
          job.kind === "image" ? `image ${job.image.imageId}` : "video";
        result.errors.push(`${listing.productTitle} — ${label}: ${outcome.error}`);
        // Park as rejected + bump the retry counter so the asset retries next
        // run, until the poison-pill cap is hit (then it's left alone).
        try {
          await parkFailedCreative(creativeId);
        } catch {
          /* publish error already recorded on the row */
        }
      }

      if (j < jobs.length - 1 && MEDIA_GAP_MS > 0) await sleep(MEDIA_GAP_MS);
    }

    result.listings.push(summary);
  }

  result.ok = result.failed === 0;
  return result;
}

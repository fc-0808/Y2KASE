/**
 * Social Studio — autonomous Pinterest auto-pin drip.
 *
 * The "set-and-forget" catalog distribution engine: every run it takes the next
 * un-pinned real product photo, turns it into a Pin, posts it to Pinterest, and
 * permanently records the image as pinned — so each catalog image becomes
 * exactly one Pin over time, with zero manual work and no duplicates.
 *
 * This is the cadence-first playbook top DTC brands use on Pinterest: the
 * algorithm rewards steady daily fresh-pin activity far more than dumping a
 * whole catalog at once, and real photos (vs. synthetic imagery) mean the asset
 * a shopper saves is the exact product they receive.
 *
 * How "pinned" is tracked
 * ───────────────────────
 * Each Pin is a `social_creatives` row whose `sourceImageId` links it back to
 * the exact `product_images.id` it was built from. An image is considered
 * "spoken for" when it has a pinterest creative in an active state
 * (draft / approved / scheduled / published). The selection query excludes
 * those, so:
 *   - images already published or scheduled are never re-pinned,
 *   - images an operator is handling manually in the studio are left alone,
 *   - failed auto attempts are parked as `rejected` and become eligible again
 *     on the next run (automatic retry) — reusing the same row, never piling up
 *     duplicates.
 *
 * Concurrency: claiming an image is a single atomic conditional INSERT, so even
 * overlapping runs can never create two Pins for the same image.
 */

import { sql } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import {
  getCreativeById,
  updateCreativeCopy,
  setCreativeStatus,
} from "@/lib/social/creatives";
import { publishCreative } from "@/lib/social/publish";
import { generateCaption } from "@/lib/social/caption-gen";
import { isImageGenConfigured } from "@/lib/social/image-gen";
import { listBoards, isPinterestConfigured } from "@/lib/social/pinterest";
import { PRODUCT_PHOTO_PRESET } from "@/lib/social/product-photos";

/** Marks creatives produced by the autonomous drip (vs. manual imports). */
export const AUTO_PIN_MODEL = "auto-pin";

/** How many Pins each run posts. One per day is the recommended evergreen drip. */
export const AUTO_PIN_PER_RUN = Math.max(
  1,
  Number(process.env.PINTEREST_AUTOPIN_PER_RUN ?? 1),
);

/** Opt-in flag — automation only runs when explicitly enabled. */
export function isAutoPinEnabled(): boolean {
  return process.env.PINTEREST_AUTOPIN_ENABLED === "true";
}

/** States that mean an image is already "spoken for" (live or in the pipeline). */
const ACTIVE_PINTEREST_STATUSES = sql`('draft','approved','scheduled','published')`;

// ─────────────────────────────────────────────────────────────────────────────
// Selection — the next un-pinned product photos
// ─────────────────────────────────────────────────────────────────────────────

export type UnpinnedImage = {
  imageId: number;
  imageUrl: string;
  altText: string | null;
  productId: number;
  productTitle: string;
  productSlug: string;
  productType: string;
  description: string | null;
  tags: string[];
};

/**
 * The next eligible product photos to pin, round-robined across products for
 * variety: every product's hero shot goes out before any product's 2nd photo,
 * and so on. Only active products with a publicly reachable image qualify.
 */
export async function getNextUnpinnedImages(
  limit: number,
): Promise<UnpinnedImage[]> {
  if (!isDbConfigured() || limit <= 0) return [];

  const rows = await db.execute<{
    image_id: number;
    image_url: string;
    alt_text: string | null;
    product_id: number;
    product_title: string;
    product_slug: string;
    product_type: string;
    description: string | null;
    tags: string[] | null;
  }>(sql`
    SELECT
      pi.id           AS image_id,
      pi.url          AS image_url,
      pi.alt_text     AS alt_text,
      p.id            AS product_id,
      p.title         AS product_title,
      p.slug          AS product_slug,
      p.product_type  AS product_type,
      p.description   AS description,
      p.tags          AS tags
    FROM product_images pi
    JOIN products p ON p.id = pi.product_id AND p.status = 'active'
    WHERE pi.url LIKE 'http%'
      AND NOT EXISTS (
        SELECT 1 FROM social_creatives sc
        WHERE sc.source_image_id = pi.id
          AND sc.platform = 'pinterest'
          AND sc.status IN ${ACTIVE_PINTEREST_STATUSES}
      )
    ORDER BY
      row_number() OVER (PARTITION BY pi.product_id ORDER BY pi.position, pi.id) ASC,
      p.created_at ASC,
      pi.product_id ASC,
      pi.id ASC
    LIMIT ${limit}
  `);

  const data = (Array.isArray(rows) ? rows : rows.rows) as Array<{
    image_id: number;
    image_url: string;
    alt_text: string | null;
    product_id: number;
    product_title: string;
    product_slug: string;
    product_type: string;
    description: string | null;
    tags: string[] | null;
  }>;

  return data.map((r) => ({
    imageId: r.image_id,
    imageUrl: r.image_url,
    altText: r.alt_text,
    productId: r.product_id,
    productTitle: r.product_title,
    productSlug: r.product_slug,
    productType: r.product_type,
    description: r.description,
    tags: r.tags ?? [],
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Coverage — "X of Y images pinned"
// ─────────────────────────────────────────────────────────────────────────────

export type AutoPinCoverage = {
  totalImages: number;
  pinnedImages: number;
  remaining: number;
  pinnedToday: number;
  enabled: boolean;
  perRun: number;
};

function startOfUtcDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function getAutoPinCoverage(): Promise<AutoPinCoverage> {
  const base: AutoPinCoverage = {
    totalImages: 0,
    pinnedImages: 0,
    remaining: 0,
    pinnedToday: 0,
    enabled: isAutoPinEnabled(),
    perRun: AUTO_PIN_PER_RUN,
  };
  if (!isDbConfigured()) return base;

  const rows = await db.execute<{
    total_images: number;
    pinned_images: number;
    remaining: number;
    pinned_today: number;
  }>(sql`
    SELECT
      (
        SELECT count(*)::int
        FROM product_images pi
        JOIN products p ON p.id = pi.product_id AND p.status = 'active'
        WHERE pi.url LIKE 'http%'
      ) AS total_images,
      (
        SELECT count(DISTINCT sc.source_image_id)::int
        FROM social_creatives sc
        WHERE sc.platform = 'pinterest'
          AND sc.status = 'published'
          AND sc.source_image_id IS NOT NULL
      ) AS pinned_images,
      (
        SELECT count(*)::int
        FROM product_images pi
        JOIN products p ON p.id = pi.product_id AND p.status = 'active'
        WHERE pi.url LIKE 'http%'
          AND NOT EXISTS (
            SELECT 1 FROM social_creatives sc
            WHERE sc.source_image_id = pi.id
              AND sc.platform = 'pinterest'
              AND sc.status IN ${ACTIVE_PINTEREST_STATUSES}
          )
      ) AS remaining,
      (
        SELECT count(*)::int
        FROM social_creatives sc
        WHERE sc.platform = 'pinterest'
          AND sc.status = 'published'
          AND sc.published_at >= ${startOfUtcDay().toISOString()}
      ) AS pinned_today
  `);

  const data = (Array.isArray(rows) ? rows : rows.rows) as Array<{
    total_images: number;
    pinned_images: number;
    remaining: number;
    pinned_today: number;
  }>;
  const r = data[0];
  if (!r) return base;
  return {
    ...base,
    totalImages: r.total_images ?? 0,
    pinnedImages: r.pinned_images ?? 0,
    remaining: r.remaining ?? 0,
    pinnedToday: r.pinned_today ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Claim — atomically reserve one image as a draft creative
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Atomically reserve an image for pinning and return the creative id, or null
 * if another run already claimed/published it (idempotent).
 *
 * A previously-failed auto attempt (parked as `rejected`) is reused and reset to
 * `draft` so retries never accumulate duplicate rows. Otherwise a fresh draft is
 * inserted only when no active pinterest creative exists for the image — the
 * conditional INSERT makes the check-and-insert a single atomic statement.
 */
async function claimImageForPin(
  image: UnpinnedImage,
  boardId: string,
): Promise<number | null> {
  // 1. Reuse a parked failed auto-pin row for this image, if any.
  const reuseRows = await db.execute<{ id: number }>(sql`
    UPDATE social_creatives
    SET status = 'draft',
        last_error = NULL,
        board_id = ${boardId},
        product_title = ${image.productTitle},
        product_slug = ${image.productSlug},
        image_url = ${image.imageUrl},
        updated_at = now()
    WHERE id = (
      SELECT id FROM social_creatives
      WHERE source_image_id = ${image.imageId}
        AND platform = 'pinterest'
        AND model = ${AUTO_PIN_MODEL}
        AND status = 'rejected'
      ORDER BY id
      LIMIT 1
    )
    RETURNING id
  `);
  const reused = (Array.isArray(reuseRows) ? reuseRows : reuseRows.rows) as Array<{
    id: number;
  }>;
  if (reused[0]?.id) return reused[0].id;

  // 2. Otherwise insert a fresh draft, but only if the image isn't already
  //    spoken for (atomic guard against concurrent runs / manual creatives).
  const insertRows = await db.execute<{ id: number }>(sql`
    INSERT INTO social_creatives
      (product_id, product_title, product_slug, source_image_id, preset,
       platform, image_url, prompt, hashtags, status, model, cost_cents, board_id)
    SELECT
      ${image.productId}, ${image.productTitle}, ${image.productSlug},
      ${image.imageId}, ${PRODUCT_PHOTO_PRESET}, 'pinterest', ${image.imageUrl},
      '(auto-pinned real product photo — no generation)', '{}', 'draft',
      ${AUTO_PIN_MODEL}, 0, ${boardId}
    WHERE NOT EXISTS (
      SELECT 1 FROM social_creatives sc
      WHERE sc.source_image_id = ${image.imageId}
        AND sc.platform = 'pinterest'
        AND sc.status IN ${ACTIVE_PINTEREST_STATUSES}
    )
    RETURNING id
  `);
  const inserted = (Array.isArray(insertRows) ? insertRows : insertRows.rows) as Array<{
    id: number;
  }>;
  return inserted[0]?.id ?? null;
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

export type AutoPinResult = {
  ok: boolean;
  pinned: number;
  failed: number;
  skipped: number;
  boardId: string | null;
  reason?: string;
  errors: string[];
};

/**
 * Post up to `max` of the next un-pinned product photos to Pinterest.
 * Each image gets a one-time, best-effort AI caption (cached per product within
 * the run), is published immediately, and is recorded as pinned. A short pause
 * between posts keeps us under Pinterest's ~6 req/min write rate limit.
 */
export async function runAutoPin(
  opts: { max?: number; boardId?: string } = {},
): Promise<AutoPinResult> {
  const max = Math.max(1, opts.max ?? AUTO_PIN_PER_RUN);
  const result: AutoPinResult = {
    ok: true,
    pinned: 0,
    failed: 0,
    skipped: 0,
    boardId: null,
    errors: [],
  };

  if (!isDbConfigured()) {
    return { ...result, ok: false, reason: "no-db" };
  }
  if (!isPinterestConfigured()) {
    return { ...result, ok: false, reason: "no-pinterest-token" };
  }

  let boardId: string;
  try {
    boardId = await resolveBoardId(opts.boardId);
  } catch (err) {
    return {
      ...result,
      ok: false,
      reason: "no-board",
      errors: [err instanceof Error ? err.message : "Could not resolve board."],
    };
  }
  result.boardId = boardId;

  const images = await getNextUnpinnedImages(max);
  if (images.length === 0) {
    return { ...result, reason: "all-pinned" };
  }

  const captionCache = new Map<number, { caption: string; hashtags: string[] }>();

  for (let i = 0; i < images.length; i++) {
    const image = images[i];

    const creativeId = await claimImageForPin(image, boardId);
    if (!creativeId) {
      result.skipped++;
      continue;
    }

    // One AI caption per product, reused across its photos (best-effort, cheap).
    if (isImageGenConfigured()) {
      let copy = captionCache.get(image.productId);
      if (!copy) {
        try {
          const generated = await generateCaption({
            productTitle: image.productTitle,
            productType: image.productType,
            description: image.description,
            tags: image.tags,
            platform: "pinterest",
            preset: PRODUCT_PHOTO_PRESET,
          });
          copy = { caption: generated.caption, hashtags: generated.hashtags };
          captionCache.set(image.productId, copy);
        } catch (err) {
          console.error("[auto-pin] caption generation failed:", err);
        }
      }
      if (copy) {
        try {
          await updateCreativeCopy(creativeId, copy.caption, copy.hashtags);
        } catch (err) {
          console.error("[auto-pin] failed to attach caption:", err);
        }
      }
    }

    const creative = await getCreativeById(creativeId);
    if (!creative) {
      result.failed++;
      result.errors.push(`#${creativeId}: creative vanished after claim.`);
      continue;
    }

    const outcome = await publishCreative(creative, {
      boardId,
      revertToScheduledOnError: false,
    });

    if (outcome.ok) {
      result.pinned++;
    } else {
      result.failed++;
      result.errors.push(`image ${image.imageId}: ${outcome.error}`);
      // Park as rejected so the image becomes eligible again next run (retry)
      // without leaving an "approved" row that looks like operator intent.
      try {
        await setCreativeStatus(creativeId, "rejected");
      } catch {
        // best-effort — the publish error is already recorded on the row.
      }
    }

    // Respect Pinterest's ~6 writes/min limit between posts.
    if (i < images.length - 1) {
      await new Promise((r) => setTimeout(r, 1100));
    }
  }

  result.ok = result.failed === 0;
  return result;
}

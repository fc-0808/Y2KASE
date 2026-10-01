/**
 * Heavy generation path for the thumbnail-normalization queue.
 *
 * Isolated from `./thumbnails` so the Sharp + vision imports are only pulled
 * into the module graph when proposals are actually generated — the review
 * page and the approve/flag/skip actions stay lightweight.
 *
 * Never import from a client component — this runs Node-only code.
 */
import sharp from "sharp";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, thumbnailProposals } from "@/lib/db/schema";
import {
  autoRetryableProposalFilter,
  productScopeFilter,
  saveProposalPreview,
} from "./thumbnails";
import {
  DEFAULT_THUMBNAIL_SCOPE,
  type ThumbnailScope,
} from "./thumbnail-scope";
import { classifyThumbnailSuitability, type ThumbnailScore } from "@/lib/ai";
import { normalizeThumbnail } from "@/lib/catalog/normalize-thumbnail";
import {
  removeHandsOnWhite,
  removeBackgroundKie,
  NoUsableReferencesError,
} from "@/lib/catalog/ai-cleanup";
import { findLocalFrame } from "@/lib/catalog/thumbnail-framing";
import {
  localFrameReason,
  nextAutoFailureReason,
} from "@/lib/catalog/thumbnail-route";
import { loadImage, type LoadedImage } from "@/lib/catalog/image-source";
import { makeR2Client, uploadWebpToR2 } from "@/lib/catalog/r2";
import { mapWithConcurrency } from "@/lib/catalog/concurrency";

/** How many products to generate in parallel. Each is mostly waiting on the
 *  image model, so parallelising cuts a full-catalog run several-fold. Tunable
 *  via THUMBNAIL_CONCURRENCY (1–16). Keep it modest to respect the provider's
 *  rate limits and the serverless function's memory/time budget. */
const CONCURRENCY = (() => {
  const v = Number(process.env.THUMBNAIL_CONCURRENCY);
  return Number.isFinite(v) && v >= 1 && v <= 16 ? Math.floor(v) : 5;
})();

/** Normalize a product into a final square thumbnail buffer: Nano Banana Pro
 *  (KIE) removes background/hands → white using ALL provided images as design
 *  references (first = primary), then Sharp trims and centers. No Photoroom. */
async function buildThumbnail(
  imageUrls: string[],
  mode: "hand" | "artifact" = "hand",
): Promise<Buffer> {
  const cleaned = await removeHandsOnWhite(imageUrls, mode);
  return normalizeThumbnail(cleaned);
}

/** All product image URLs with `primaryId` first (the primary framing
 *  reference), the rest following in gallery order — passed to the model as
 *  multi-image references so it reproduces the design accurately. */
function orderedImageUrls(
  images: { id: number; url: string }[],
  primaryId: number,
): string[] {
  const primary = images.find((i) => i.id === primaryId);
  const rest = images.filter((i) => i.id !== primaryId);
  return [...(primary ? [primary] : []), ...rest].map((i) => i.url);
}

/** Minimum AI suitability score for an image to be auto-normalized. */
export const THUMBNAIL_SCORE_THRESHOLD = 0.6;

/** Mirror of the ingest key sanitiser so proposal keys match the R2 layout. */
const sanitise = (s: string) => s.replace(/[^a-zA-Z0-9/_-]/g, "_");

/**
 * The sentence stored on a flagged row, and shown on its card.
 *
 * An unusable-source error already reads as an instruction ("re-upload the
 * product's photos"), so it is passed through verbatim; anything else is an
 * unexpected fault and is labelled as one.
 */
function failureReason(err: unknown): string {
  if (err instanceof NoUsableReferencesError) return err.message;
  return `Generation failed: ${err instanceof Error ? err.message : String(err)}`;
}

const UNSCORED: ThumbnailScore = {
  score: 0,
  category: "busy",
  cleanProductShot: false,
  reason: "unscored",
};

/** Pick the image a cleanup should operate on: the one the proposal was derived
 *  from, else the highest-positioned (thumbnail) image. */
function pickSourceImage<T extends { id: number; position: number }>(
  images: T[],
  preferredId: number | null | undefined,
): T | undefined {
  if (preferredId != null) {
    const found = images.find((i) => i.id === preferredId);
    if (found) return found;
  }
  return images[0];
}

function upsertProposal(
  productId: number,
  patch: Parameters<typeof saveProposalPreview>[1],
) {
  return saveProposalPreview(productId, patch);
}

export type GenerateResult = {
  processed: number;
  proposed: number;
  flagged: number;
  /** Proposals framed from a clean white shot, with no image-model call. */
  local: number;
  /** Proposals that paid for Nano Banana Pro (or the configured fallback). */
  generative: number;
};

type ProductOutcome = {
  status: "proposed" | "flagged";
  engine: "local" | "generative" | "none";
  message: string;
};

/** Generate (or flag) a single product's thumbnail. Self-contained so the batch
 *  can run many of these in parallel. Never throws — returns the outcome.
 *
 *  Clean product shots on flat paper white are framed locally (Sharp only).
 *  Everything else — hands, props, scenes, tinted backdrops, a vision miss —
 *  still goes through Nano Banana Pro. `previousReason` is the row's current
 *  failure text, so a retry can count attempts without another read. */
async function processProduct(
  id: number,
  r2: ReturnType<typeof makeR2Client>,
  bucket: string,
  previousReason: string | null,
): Promise<ProductOutcome> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, id),
    columns: { id: true, slug: true, title: true },
    with: {
      images: {
        columns: { id: true, url: true, altText: true, position: true },
        orderBy: (img, { asc: a }) => a(img.position),
      },
    },
  });

  if (!product || product.images.length === 0) {
    const reason = nextAutoFailureReason(
      previousReason,
      "No images on this product.",
      true,
    );
    await upsertProposal(id, { status: "flagged", reason });
    return { status: "flagged", engine: "none", message: reason };
  }

  try {
    const scores = await classifyThumbnailSuitability(
      product.images.map((img) => ({
        filename: String(img.id),
        imageUrl: img.url,
      })),
    );

    // The winning score picks the primary reference when we do have to
    // generate. It does not, by itself, authorize a Nano Banana Pro call.
    let best = product.images[0];
    let bestScore = scores[String(best.id)] ?? UNSCORED;
    for (const img of product.images) {
      const s = scores[String(img.id)] ?? UNSCORED;
      if (s.score > bestScore.score) {
        best = img;
        bestScore = s;
      }
    }

    const local = await findLocalFrame(
      product.images.map((img) => ({
        id: img.id,
        url: img.url,
        score: scores[String(img.id)] ?? UNSCORED,
      })),
    );

    let normalized: Buffer;
    let engine: "local" | "generative";
    let sourceId = best.id;
    let sourceScore = bestScore;
    let reason = bestScore.reason;

    if (local) {
      try {
        normalized = await normalizeThumbnail(local.bytes);
        engine = "local";
        sourceId = local.id;
        sourceScore = local.score;
        reason = localFrameReason(local.score.reason);
      } catch (err) {
        console.warn(
          `[thumbnails] product ${id} local framing failed (${err instanceof Error ? err.message : err}); using generative cleanup`,
        );
        normalized = await buildThumbnail(
          orderedImageUrls(product.images, best.id),
          "hand",
        );
        engine = "generative";
      }
    } else {
      normalized = await buildThumbnail(
        orderedImageUrls(product.images, best.id),
        "hand",
      );
      engine = "generative";
    }

    const key = `products/${sanitise(product.slug)}/thumbnail-proposal-${Date.now()}.webp`;
    const proposalUrl = await uploadWebpToR2(r2, bucket, key, normalized);

    await upsertProposal(id, {
      status: "proposed",
      proposalUrl,
      sourceImageId: sourceId,
      score: sourceScore.score,
      category: sourceScore.category,
      reason,
    });
    console.info(
      `[thumbnails] product ${id} engine=${engine} score=${sourceScore.score.toFixed(2)} ${sourceScore.category}`,
    );
    return {
      status: "proposed",
      engine,
      message:
        engine === "local"
          ? "Framed from the clean product shot."
          : "Thumbnail generated.",
    };
  } catch (err) {
    const reason = nextAutoFailureReason(
      previousReason,
      failureReason(err),
      err instanceof NoUsableReferencesError,
    );
    await upsertProposal(id, { status: "flagged", reason });
    console.info(`[thumbnails] product ${id} flagged: ${reason}`);
    return { status: "flagged", engine: "none", message: reason };
  }
}

/**
 * Cost-aware generation for one product — the per-card Generate button and
 * the batch share this. Explicit Regenerate stays on {@link
 * regenerateProposalWithAiCleanup}, which always uses the generative engine:
 * that button means the free framing was not good enough.
 */
export async function generateProposalForProduct(
  productId: number,
): Promise<{ ok: boolean; message: string }> {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME is not set.");

  const existing = await db.query.thumbnailProposals.findFirst({
    where: eq(thumbnailProposals.productId, productId),
    columns: { reason: true },
  });
  const outcome = await processProduct(
    productId,
    makeR2Client(),
    bucket,
    existing?.reason ?? null,
  );
  return { ok: outcome.status === "proposed", message: outcome.message };
}

/**
 * Process the next `limit` products in `scope` that still need a thumbnail:
 * no proposal yet, plus system failures that have not exhausted their
 * automatic attempts. Human flags are not in this set — Generate all must
 * not re-bill a decision the operator already made.
 *
 * Never-attempted products are ordered ahead of retries, so a failing row
 * cannot sit at the head of the queue and starve the catalog behind it.
 */
export async function generateProposalsForPending(
  limit: number,
  scope: ThumbnailScope = DEFAULT_THUMBNAIL_SCOPE,
): Promise<GenerateResult> {
  const candidates = await db
    .select({ id: products.id, reason: thumbnailProposals.reason })
    .from(products)
    .leftJoin(thumbnailProposals, eq(thumbnailProposals.productId, products.id))
    .where(
      and(
        productScopeFilter(scope),
        or(isNull(thumbnailProposals.id), autoRetryableProposalFilter()),
      ),
    )
    .orderBy(
      // `false` sorts before `true`, so products with no proposal row go first.
      sql`(${thumbnailProposals.id} is not null) asc`,
      asc(products.id),
    )
    .limit(Math.max(1, Math.min(limit, 50)));

  if (candidates.length === 0) {
    return { processed: 0, proposed: 0, flagged: 0, local: 0, generative: 0 };
  }

  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME is not set.");
  const r2 = makeR2Client();

  const outcomes = await mapWithConcurrency(candidates, CONCURRENCY, (row) =>
    processProduct(row.id, r2, bucket, row.reason),
  );

  return {
    processed: candidates.length,
    proposed: outcomes.filter((o) => o.status === "proposed").length,
    flagged: outcomes.filter((o) => o.status === "flagged").length,
    local: outcomes.filter((o) => o.engine === "local").length,
    generative: outcomes.filter((o) => o.engine === "generative").length,
  };
}

/**
 * Generatively remove the hand/props from a product's selected image and
 * re-present it on plain white, then run it through the same background-removal
 * + centering pipeline so the framing matches every other thumbnail. Produces a
 * fresh "proposed" preview for the human to approve. Human-triggered only.
 */
export async function regenerateProposalWithAiCleanup(
  productId: number,
  mode: "hand" | "artifact" = "hand",
): Promise<{ ok: boolean; message: string }> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { id: true, slug: true },
    with: {
      images: {
        columns: { id: true, url: true, position: true },
        orderBy: (img, { asc: a }) => a(img.position),
      },
    },
  });
  if (!product || product.images.length === 0) {
    return { ok: false, message: "No images to process." };
  }

  const existing = await db.query.thumbnailProposals.findFirst({
    where: eq(thumbnailProposals.productId, productId),
    columns: { sourceImageId: true, score: true },
  });
  const source = pickSourceImage(product.images, existing?.sourceImageId);
  if (!source) return { ok: false, message: "No source image found." };

  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME is not set.");

  // Nano Banana Pro removes hand/props/background → white, using ALL of the
  // product's photos as references (source first) for design accuracy, then
  // Sharp trims + centers for consistent framing. No Photoroom.
  //
  // A failure here leaves the existing row alone on purpose: the operator asked
  // to rebuild one thumbnail, and demoting a live one because a provider call
  // failed would lose work. The reason is returned instead, for the toast.
  let normalized: Buffer;
  try {
    normalized = await buildThumbnail(
      orderedImageUrls(product.images, source.id),
      mode,
    );
  } catch (err) {
    return { ok: false, message: failureReason(err) };
  }

  const r2 = makeR2Client();
  const key = `products/${sanitise(product.slug)}/thumbnail-cleaned-${Date.now()}.webp`;
  const proposalUrl = await uploadWebpToR2(r2, bucket, key, normalized);

  await upsertProposal(productId, {
    status: "proposed",
    proposalUrl,
    sourceImageId: source.id,
    score: existing?.score != null ? Number(existing.score) : null,
    category: "clean_product",
    reason: "AI hand-removal applied — review the reconstructed product.",
  });

  return { ok: true, message: "AI hand-removal applied." };
}

/**
 * Remove the background from the current proposal with a true segmentation model
 * (Recraft via KIE) — preserving the product pixels exactly — then re-center it
 * on the standard 4:5 white canvas. Cleans a residual gray/studio background
 * without repainting the product.
 */
export async function removeBackgroundProposal(
  productId: number,
): Promise<{ ok: boolean; message: string }> {
  const prop = await db.query.thumbnailProposals.findFirst({
    where: eq(thumbnailProposals.productId, productId),
  });
  if (!prop?.proposalUrl) {
    return { ok: false, message: "No thumbnail to process." };
  }
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME is not set.");

  // Segment product → transparent PNG, then composite onto white + center.
  let normalized: Buffer;
  try {
    const cutout = await removeBackgroundKie(prop.proposalUrl);
    normalized = await normalizeThumbnail(cutout);
  } catch (err) {
    return { ok: false, message: failureReason(err) };
  }

  const r2 = makeR2Client();
  const key = `products/manual/${productId}-nobg-${Date.now()}.webp`;
  const url = await uploadWebpToR2(r2, bucket, key, normalized);

  await upsertProposal(productId, {
    status: "proposed",
    proposalUrl: url,
    sourceImageId: prop.sourceImageId,
    score: prop.score != null ? Number(prop.score) : null,
    category: prop.category ?? "manual",
    reason: "Background removed.",
  });
  return { ok: true, message: "Background removed." };
}

/** Crop rectangle as fractions (0–1) of the proposal image. */
export type CropRect = { x: number; y: number; w: number; h: number };

/**
 * Re-crop the current proposal to the region the admin selected (removing any
 * leftover background/props to the side), then re-normalize onto the standard
 * 4:5 white canvas so it's centered at the same size as every other thumbnail.
 */
export async function recropProposal(
  productId: number,
  rect: CropRect,
): Promise<{ ok: boolean; message: string }> {
  const prop = await db.query.thumbnailProposals.findFirst({
    where: eq(thumbnailProposals.productId, productId),
  });
  if (!prop?.proposalUrl) {
    return { ok: false, message: "No thumbnail to adjust." };
  }
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME is not set.");

  let source: LoadedImage;
  try {
    source = await loadImage(prop.proposalUrl);
  } catch (err) {
    return { ok: false, message: failureReason(err) };
  }
  const { bytes: buf, width: W, height: H } = source;

  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));
  const left = clamp(Math.round(rect.x * W), 0, W - 1);
  const top = clamp(Math.round(rect.y * H), 0, H - 1);
  const width = clamp(Math.round(rect.w * W), 1, W - left);
  const height = clamp(Math.round(rect.h * H), 1, H - top);

  const cropped = await sharp(buf)
    .extract({ left, top, width, height })
    .toBuffer();
  const normalized = await normalizeThumbnail(cropped);

  const r2 = makeR2Client();
  const key = `products/manual/${productId}-crop-${Date.now()}.webp`;
  const url = await uploadWebpToR2(r2, bucket, key, normalized);

  await upsertProposal(productId, {
    status: "proposed",
    proposalUrl: url,
    sourceImageId: prop.sourceImageId,
    score: prop.score != null ? Number(prop.score) : null,
    category: prop.category ?? "manual",
    reason: "Manually adjusted (crop).",
  });
  return { ok: true, message: "Thumbnail adjusted." };
}

/**
 * Regenerate several products in parallel (bounded by CONCURRENCY). Used by the
 * bulk "Regenerate" action; the client sends manageable chunks so each request
 * stays within the serverless time budget.
 *
 * Reports one representative failure alongside the counts. A silent "Regenerated
 * 3" when five were selected tells the operator nothing about the other two, and
 * in practice the two share a cause worth naming.
 */
export async function regenerateProposalsWithAiCleanup(
  ids: number[],
): Promise<{ processed: number; failed: number; firstFailure?: string }> {
  const outcomes = await mapWithConcurrency(ids, CONCURRENCY, async (id) => {
    try {
      return await regenerateProposalWithAiCleanup(id);
    } catch (err) {
      return { ok: false, message: failureReason(err) };
    }
  });
  return {
    processed: outcomes.filter((o) => o.ok).length,
    failed: outcomes.filter((o) => !o.ok).length,
    firstFailure: outcomes.find((o) => !o.ok)?.message,
  };
}

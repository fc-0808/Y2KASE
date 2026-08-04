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
import { productScopeFilter } from "./thumbnails";
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

type ProposalPatch = {
  status: "proposed" | "flagged";
  proposalUrl?: string | null;
  sourceImageId?: number | null;
  score?: number | null;
  category?: string | null;
  reason?: string | null;
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

async function upsertProposal(productId: number, patch: ProposalPatch) {
  const row = {
    productId,
    status: patch.status,
    proposalUrl: patch.proposalUrl ?? null,
    sourceImageId: patch.sourceImageId ?? null,
    score: patch.score != null ? String(patch.score) : null,
    category: patch.category ?? null,
    reason: patch.reason ?? null,
    updatedAt: new Date(),
  };
  await db
    .insert(thumbnailProposals)
    .values(row)
    .onConflictDoUpdate({
      target: thumbnailProposals.productId,
      set: {
        status: row.status,
        proposalUrl: row.proposalUrl,
        sourceImageId: row.sourceImageId,
        score: row.score,
        category: row.category,
        reason: row.reason,
        updatedAt: row.updatedAt,
      },
    });
}

export type GenerateResult = {
  processed: number;
  proposed: number;
  flagged: number;
};

/** Generate (or flag) a single product's thumbnail. Self-contained so the batch
 *  can run many of these in parallel. Never throws — returns the outcome. */
async function processProduct(
  id: number,
  r2: ReturnType<typeof makeR2Client>,
  bucket: string,
): Promise<"proposed" | "flagged"> {
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
    await upsertProposal(id, {
      status: "flagged",
      reason: "No images on this product.",
    });
    return "flagged";
  }

  try {
    const scores = await classifyThumbnailSuitability(
      product.images.map((img) => ({
        filename: String(img.id),
        imageUrl: img.url,
      })),
    );

    // Scoring only chooses the best PRIMARY reference (framing); every product
    // is generated — Nano Banana Pro removes any hand, so we no longer flag.
    let best = product.images[0];
    let bestScore = scores[String(best.id)] ?? UNSCORED;
    for (const img of product.images) {
      const s = scores[String(img.id)] ?? UNSCORED;
      if (s.score > bestScore.score) {
        best = img;
        bestScore = s;
      }
    }

    const normalized = await buildThumbnail(
      orderedImageUrls(product.images, best.id),
      "hand",
    );

    const key = `products/${sanitise(product.slug)}/thumbnail-proposal-${Date.now()}.webp`;
    const proposalUrl = await uploadWebpToR2(r2, bucket, key, normalized);

    await upsertProposal(id, {
      status: "proposed",
      proposalUrl,
      sourceImageId: best.id,
      score: bestScore.score,
      category: bestScore.category,
      reason: bestScore.reason,
    });
    return "proposed";
  } catch (err) {
    await upsertProposal(id, { status: "flagged", reason: failureReason(err) });
    return "flagged";
  }
}

/**
 * Process the next `limit` products in `scope` that still need a thumbnail —
 * those with no proposal yet, plus any previously "flagged" (retried, since
 * Nano Banana Pro can now remove hands). Runs up to CONCURRENCY products in
 * parallel. Each product is independent — one failure flags that product; the
 * run continues.
 *
 * Never-attempted products are ordered ahead of flagged retries. A flagged
 * product stays a candidate forever, so ordering by id alone let a permanently
 * failing product sit at the head of the queue and consume the same slot on
 * every batch, starving everything behind it.
 */
export async function generateProposalsForPending(
  limit: number,
  scope: ThumbnailScope = DEFAULT_THUMBNAIL_SCOPE,
): Promise<GenerateResult> {
  const candidates = await db
    .select({ id: products.id })
    .from(products)
    .leftJoin(thumbnailProposals, eq(thumbnailProposals.productId, products.id))
    .where(
      and(
        productScopeFilter(scope),
        or(
          isNull(thumbnailProposals.id),
          eq(thumbnailProposals.status, "flagged"),
        ),
      ),
    )
    .orderBy(
      // `false` sorts before `true`, so products with no proposal row go first.
      sql`(${thumbnailProposals.id} is not null) asc`,
      asc(products.id),
    )
    .limit(Math.max(1, Math.min(limit, 50)));

  const ids = candidates.map((c) => c.id);
  if (ids.length === 0) return { processed: 0, proposed: 0, flagged: 0 };

  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME is not set.");
  const r2 = makeR2Client();

  const outcomes = await mapWithConcurrency(ids, CONCURRENCY, (id) =>
    processProduct(id, r2, bucket),
  );

  return {
    processed: ids.length,
    proposed: outcomes.filter((o) => o === "proposed").length,
    flagged: outcomes.filter((o) => o === "flagged").length,
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

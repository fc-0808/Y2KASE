"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { getProductForAdmin } from "@/lib/products";
import { makeR2Client, deleteObjectsFromR2, r2KeyFromUrl } from "@/lib/catalog/r2";
import {
  generateMarketingImage,
  isImageGenConfigured,
  type ImageQuality,
} from "@/lib/social/image-gen";
import { generateCaption } from "@/lib/social/caption-gen";
import { getPreset, type SocialPlatform } from "@/lib/social/presets";
import {
  insertCreative,
  setCreativeStatus,
  deleteCreative,
  updateCreativeCopy,
  countCreativesSince,
  getCreativeById,
  scheduleCreative,
  CREATIVE_STATUSES,
  type CreativeStatus,
} from "@/lib/social/creatives";
import { publishCreative } from "@/lib/social/publish";
import {
  isPinterestConfigured,
  listBoards,
  type PinterestBoard,
} from "@/lib/social/pinterest";

export type SocialActionResult = {
  ok: boolean;
  message: string;
  creativeId?: number;
};

/**
 * Safety cap: max AI creatives generated per rolling 24h. Prevents runaway
 * OpenAI spend from a stuck loop or accidental bulk click. Override via env.
 */
const DAILY_LIMIT = Number(process.env.SOCIAL_DAILY_LIMIT ?? 50);

const VALID_STATUS = new Set<string>(CREATIVE_STATUSES);

async function guard(): Promise<boolean> {
  return Boolean(await requireAdmin(await headers()));
}

/**
 * Generate one AI creative for a product: image (gpt-image-1) + platform caption,
 * persisted as a `draft` for human review.
 */
export async function generateCreative(input: {
  productId: number;
  preset: string;
  platform?: string;
  quality?: string;
  extra?: string;
}): Promise<SocialActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };

  if (!isImageGenConfigured()) {
    return {
      ok: false,
      message: "OPENAI_API_KEY is not set — image generation is unavailable.",
    };
  }

  const preset = getPreset(input.preset);
  if (!preset) return { ok: false, message: "Unknown preset." };

  // Daily spend guardrail.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const used = await countCreativesSince(since);
  if (used >= DAILY_LIMIT) {
    return {
      ok: false,
      message: `Daily generation limit reached (${DAILY_LIMIT}). Try again tomorrow or raise SOCIAL_DAILY_LIMIT.`,
    };
  }

  const product = await getProductForAdmin(input.productId);
  if (!product) return { ok: false, message: "Product not found." };

  const platform = (input.platform ?? preset.platform) as SocialPlatform;
  const quality = (input.quality ?? "medium") as ImageQuality;

  const productCtx = {
    title: product.title,
    productType: product.productType,
    description: product.description,
    materials: product.materials,
    tags: product.tags ?? [],
  };

  const prompt = preset.buildPrompt(productCtx, input.extra);

  try {
    // 1) Image → R2
    const image = await generateMarketingImage(prompt, {
      size: preset.size,
      quality,
      keyPrefix: `p${product.id}`,
    });

    // 2) Caption + hashtags (best-effort — image is the hero, copy can be edited)
    let caption = "";
    let hashtags: string[] = [];
    try {
      const copy = await generateCaption({
        productTitle: product.title,
        productType: product.productType,
        description: product.description,
        tags: product.tags ?? [],
        platform,
        preset: preset.key,
        extra: input.extra,
      });
      caption = copy.caption;
      hashtags = copy.hashtags;
    } catch (err) {
      console.error("[social] caption generation failed:", err);
    }

    // 3) Persist as draft
    const creativeId = await insertCreative({
      productId: product.id,
      productTitle: product.title,
      preset: preset.key,
      platform,
      imageUrl: image.imageUrl,
      prompt,
      caption,
      hashtags,
      model: image.model,
      costCents: image.costCents,
    });

    revalidatePath("/admin/social");
    return { ok: true, message: "Creative generated.", creativeId };
  } catch (err) {
    console.error("[social] generation failed:", err);
    const msg =
      err instanceof Error ? err.message : "Generation failed. Please try again.";
    return { ok: false, message: msg };
  }
}

/** Approve / reject / publish / re-draft a creative. */
export async function moderateCreative(
  id: number,
  status: string,
): Promise<SocialActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };
  if (!Number.isFinite(id) || !VALID_STATUS.has(status)) {
    return { ok: false, message: "Invalid request." };
  }
  await setCreativeStatus(id, status as CreativeStatus);
  revalidatePath("/admin/social");
  return { ok: true, message: `Creative ${status}.` };
}

/** Edit a creative's caption + hashtags. */
export async function editCreativeCopy(
  id: number,
  caption: string,
  hashtagsCsv: string,
): Promise<SocialActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };
  const hashtags = hashtagsCsv
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, "").trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 15);
  await updateCreativeCopy(id, caption.trim(), hashtags);
  revalidatePath("/admin/social");
  return { ok: true, message: "Copy updated." };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLISHING (Pinterest)
// ─────────────────────────────────────────────────────────────────────────────

export type BoardsResult = {
  ok: boolean;
  message: string;
  configured: boolean;
  boards: PinterestBoard[];
};

/** Fetch the connected Pinterest account's boards for the publish picker. */
export async function fetchPinterestBoards(): Promise<BoardsResult> {
  if (!(await guard())) {
    return { ok: false, message: "Not authorized.", configured: false, boards: [] };
  }
  if (!isPinterestConfigured()) {
    return {
      ok: false,
      message: "PINTEREST_ACCESS_TOKEN is not set.",
      configured: false,
      boards: [],
    };
  }
  try {
    const boards = await listBoards();
    return { ok: true, message: "", configured: true, boards };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load boards.";
    return { ok: false, message: msg, configured: true, boards: [] };
  }
}

/** Publish a creative to Pinterest immediately. */
export async function publishNow(
  id: number,
  boardId: string,
): Promise<SocialActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };
  if (!boardId) return { ok: false, message: "Pick a board first." };

  const creative = await getCreativeById(id);
  if (!creative) return { ok: false, message: "Creative not found." };

  const outcome = await publishCreative(creative, {
    boardId,
    revertToScheduledOnError: false,
  });
  revalidatePath("/admin/social");
  return outcome.ok
    ? { ok: true, message: "Published to Pinterest 📌", creativeId: id }
    : { ok: false, message: outcome.error };
}

/** Schedule a creative for automated publishing. `whenIso` is an ISO datetime. */
export async function schedulePublish(
  id: number,
  whenIso: string,
  boardId: string,
): Promise<SocialActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };
  if (!boardId) return { ok: false, message: "Pick a board first." };

  const when = new Date(whenIso);
  if (Number.isNaN(when.getTime())) {
    return { ok: false, message: "Invalid date/time." };
  }
  if (when.getTime() < Date.now() - 60_000) {
    return { ok: false, message: "Pick a time in the future." };
  }

  await scheduleCreative(id, when, boardId);
  revalidatePath("/admin/social");
  return { ok: true, message: "Scheduled ⏰", creativeId: id };
}

/** Delete a creative and clean up its R2 object. */
export async function removeCreative(id: number): Promise<SocialActionResult> {
  if (!(await guard())) return { ok: false, message: "Not authorized." };
  const imageUrl = await deleteCreative(id);
  if (imageUrl) {
    const key = r2KeyFromUrl(imageUrl);
    if (key) {
      try {
        const bucket = process.env.R2_BUCKET_NAME;
        if (bucket) await deleteObjectsFromR2(makeR2Client(), bucket, [key]);
      } catch (err) {
        console.error("[social] R2 cleanup failed:", err);
      }
    }
  }
  revalidatePath("/admin/social");
  return { ok: true, message: "Creative deleted." };
}

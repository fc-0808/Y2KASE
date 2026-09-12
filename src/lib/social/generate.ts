/**
 * Social Studio — single-creative generation core.
 *
 * Shared by the admin "Generate" action and the batch queue worker so both
 * paths produce identical results and share the daily spend guardrail.
 */

import { getProductForAdmin } from "@/lib/products";
import {
  generateMarketingImage,
  isImageGenConfigured,
  type ImageQuality,
} from "@/lib/social/image-gen";
import { catalogReferenceUrls } from "@/lib/social/image-gen-policy";
import { generateCaption } from "@/lib/social/caption-gen";
import { getPreset, type SocialPlatform } from "@/lib/social/presets";
import { pillarFromPreset } from "@/lib/social/instagram-fashion";
import { insertCreative, countCreativesSince } from "@/lib/social/creatives";

/** Max AI creatives generated per rolling 24h (spend guardrail). */
export const DAILY_LIMIT = Number(process.env.SOCIAL_DAILY_LIMIT ?? 50);

export type GenerateInput = {
  productId: number;
  preset: string;
  platform?: string;
  quality?: string;
  extra?: string;
};

export type GenerateResult =
  | { ok: true; creativeId: number }
  | { ok: false; error: string };

/** True if generating one more creative would exceed the daily cap. */
export async function isDailyLimitReached(): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const used = await countCreativesSince(since);
  return used >= DAILY_LIMIT;
}

/**
 * Generate one creative (image + caption) and persist it as a draft.
 * Enforces the daily cap. Does not perform auth — callers must guard.
 */
export async function runGeneration(
  input: GenerateInput,
): Promise<GenerateResult> {
  if (!isImageGenConfigured()) {
    return { ok: false, error: "OPENAI_API_KEY is not set." };
  }

  const preset = getPreset(input.preset);
  if (!preset) return { ok: false, error: "Unknown preset." };

  if (await isDailyLimitReached()) {
    return {
      ok: false,
      error: `Daily generation limit reached (${DAILY_LIMIT}).`,
    };
  }

  const product = await getProductForAdmin(input.productId);
  if (!product) return { ok: false, error: "Product not found." };

  const platform = (input.platform ?? preset.platform) as SocialPlatform;
  const quality = (input.quality ??
    (preset.usesProductReference ? "high" : "medium")) as ImageQuality;

  const prompt = preset.buildPrompt(
    {
      title: product.title,
      productType: product.productType,
      description: product.description,
      materials: product.materials,
      characterName: product.characterName,
      brandName: product.brandName,
      tags: product.tags ?? [],
    },
    input.extra,
  );

  const referenceImageUrls = preset.usesProductReference
    ? catalogReferenceUrls((product.images ?? []).map((img) => img.url))
    : [];

  if (preset.usesProductReference && referenceImageUrls.length === 0) {
    return {
      ok: false,
      error:
        "This listing has no catalog photos. Fashion stills must copy a real product photo — add photos first, or the model will invent a SKU.",
    };
  }

  try {
    const image = await generateMarketingImage(prompt, {
      size: preset.size,
      quality,
      keyPrefix: `p${product.id}`,
      referenceImageUrls,
      requireReferences: Boolean(preset.usesProductReference),
    });

    // Caption is best-effort — the image is the hero and copy is editable.
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
        pillar: pillarFromPreset(preset.key) ?? undefined,
        characterName: product.characterName,
        brandName: product.brandName,
      });
      caption = copy.caption;
      hashtags = copy.hashtags;
    } catch (err) {
      console.error("[social] caption generation failed:", err);
    }

    const creativeId = await insertCreative({
      productId: product.id,
      productTitle: product.title,
      productSlug: product.slug,
      preset: preset.key,
      platform,
      imageUrl: image.imageUrl,
      prompt,
      caption,
      hashtags,
      model: image.model,
      costCents: image.costCents,
    });

    return { ok: true, creativeId };
  } catch (err) {
    console.error("[social] generation failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Generation failed.",
    };
  }
}

import "server-only";

import { randomUUID } from "node:crypto";
import { loadImage } from "@/lib/catalog/image-source";
import { makeR2Client, uploadImageToR2 } from "@/lib/catalog/r2";
import { composeCatalogMarketingHero } from "./hero-compose";
import { isMarketingHeroGenerationConfigured } from "./hero-config";
import {
  MARKETING_HERO_OUTPUT,
  MARKETING_HERO_REFERENCE_LIMIT,
  buildMarketingHeroAlt,
  type MarketingHeroReference,
  type MarketingHeroStyle,
} from "./hero";

export type MarketingHeroProvider = "catalog";

export type GeneratedMarketingHero = {
  imageUrl: string;
  imageAlt: string;
  provider: MarketingHeroProvider;
  model: string;
  width: number;
  height: number;
  byteSize: number;
};

/**
 * Compose exact catalogue images into a text-free hero and persist an
 * email-compatible immutable JPEG. No campaign record is changed; the operator
 * sees the image in the live preview and explicitly saves/tests that exact URL.
 */
export async function generateMarketingHero(input: {
  campaignId: string;
  style: MarketingHeroStyle;
  references: readonly MarketingHeroReference[];
}): Promise<GeneratedMarketingHero> {
  if (!isMarketingHeroGenerationConfigured()) {
    throw new Error(
      "Campaign hero creation requires complete R2 configuration.",
    );
  }
  if (
    input.references.length === 0 ||
    input.references.length > MARKETING_HERO_REFERENCE_LIMIT
  ) {
    throw new Error(
      `Choose 1–${MARKETING_HERO_REFERENCE_LIMIT} real product images.`,
    );
  }

  const images = await Promise.all(
    input.references.map((reference) => loadImage(reference.imageUrl)),
  );
  const jpeg = await composeCatalogMarketingHero(
    images.map((image) => image.bytes),
    input.style,
  );

  // Campaign id is validated by the Server Action; sanitize again to keep this
  // storage primitive safe if another internal caller is added later.
  const campaignKey = input.campaignId.replace(/[^a-z0-9-]/gi, "");
  const key = `marketing/campaigns/${campaignKey}/hero-catalog-v1-${Date.now()}-${randomUUID().slice(0, 8)}.jpg`;
  const bucket = process.env.R2_BUCKET_NAME!;
  const imageUrl = await uploadImageToR2(
    makeR2Client(),
    bucket,
    key,
    jpeg,
    "image/jpeg",
  );

  return {
    imageUrl,
    imageAlt: buildMarketingHeroAlt(input.references),
    provider: "catalog",
    model: "sharp-catalog-collage-v1",
    width: MARKETING_HERO_OUTPUT.width,
    height: MARKETING_HERO_OUTPUT.height,
    byteSize: jpeg.byteLength,
  };
}

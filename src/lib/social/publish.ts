/**
 * Social Studio — publishing orchestration.
 *
 * Shared by the admin "Publish now" action and the scheduled-publish cron.
 * Currently targets Pinterest (the only major platform with fully automated
 * publishing). The creative's destination link points back to the source
 * product page with UTM tags so Pinterest-driven traffic is attributable.
 */

import { createPin, isPinterestConfigured } from "@/lib/social/pinterest";
import { markPublished, markPublishFailed, type SocialCreative } from "@/lib/social/creatives";

export type PublishOutcome =
  | { ok: true; externalId: string; externalUrl: string }
  | { ok: false; error: string };

function productLink(creative: SocialCreative): string | undefined {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!site) return undefined;
  const utm =
    "utm_source=pinterest&utm_medium=social&utm_campaign=auto_pin";
  // Deep-link to the specific product page when we have its slug (drives
  // conversions + clean attribution); fall back to the shop grid otherwise.
  if (creative.productSlug) {
    return `${site}/products/${creative.productSlug}?${utm}`;
  }
  return `${site}/products?${utm}`;
}

/**
 * Publish a single creative to its target platform.
 * Assumes the caller has already claimed the row (or is the admin acting on it).
 * On failure, records the error and reverts status appropriately.
 */
export async function publishCreative(
  creative: SocialCreative,
  opts: { boardId?: string; revertToScheduledOnError?: boolean } = {},
): Promise<PublishOutcome> {
  const boardId = opts.boardId ?? creative.boardId ?? undefined;

  try {
    if (creative.platform !== "pinterest") {
      throw new Error(
        `Automated publishing is only available for Pinterest right now (got "${creative.platform}").`,
      );
    }
    if (!isPinterestConfigured()) {
      throw new Error("PINTEREST_ACCESS_TOKEN is not set.");
    }
    if (!boardId) {
      throw new Error("No Pinterest board selected for this creative.");
    }

    const description = [creative.caption, creative.hashtags.map((t) => `#${t}`).join(" ")]
      .filter(Boolean)
      .join("\n\n");

    const pin = await createPin({
      boardId,
      imageUrl: creative.imageUrl,
      title: creative.productTitle ?? undefined,
      description: description || undefined,
      link: productLink(creative),
    });

    await markPublished(creative.id, pin.id, pin.url);
    return { ok: true, externalId: pin.id, externalUrl: pin.url };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed.";
    await markPublishFailed(
      creative.id,
      message,
      opts.revertToScheduledOnError ?? true,
    );
    return { ok: false, error: message };
  }
}

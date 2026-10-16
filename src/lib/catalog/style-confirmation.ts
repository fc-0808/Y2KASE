/**
 * Which photo the mobile "Your look" row shows.
 *
 * The row stays for every selected style. Hiding it on styles that only have
 * a scene photo made Add to Bag jump, which read as a broken page. A cleaned
 * catalog thumbnail is preferred when it depicts this style, then a
 * white-background pack shot, then the style's own gallery photo — scene
 * included — so the picture still changes with the choice. Charm Only uses a
 * photo of a bundle that includes the charm — Case + Grip + Charm, then
 * Case + Charm — so the row shows the charm on the product. A style with no
 * photo of its own keeps the cleaned thumbnail (or the first gallery photo)
 * so the slot does not disappear.
 */

import { customStyleByLabel, type CustomStyle } from "@/lib/catalog/custom-styles";
import { imageStyleTag } from "@/lib/pricing";

/**
 * Matches `NORMALIZED_THUMBNAIL_SOURCE` in the schema. Duplicated here so the
 * storefront client does not import the table module. The custom-styles check
 * asserts the two strings stay equal.
 */
export const NORMALIZED_THUMBNAIL_FILENAME = "thumbnail-normalized";

type ConfirmationImage = {
  id: number;
  url: string;
  styleTags: string[];
  sourceFilename?: string | null;
};

function depictedStyle(
  tags: readonly string[] | null | undefined,
): string | null {
  const canonical = imageStyleTag(tags);
  if (canonical) return canonical;
  const raw = tags?.find((tag) => tag.trim());
  return raw?.trim() ?? null;
}

/** Supplier pack shots named as a white-background plate (白底图). */
function isWhiteBackgroundFilename(name: string | null | undefined): boolean {
  if (!name) return false;
  return name.includes("白底");
}

function isNormalizedThumbnail(name: string | null | undefined): boolean {
  return name === NORMALIZED_THUMBNAIL_FILENAME;
}

/** Charm Only should preview a configuration that actually includes the charm. */
const CHARM_ONLY = "Charm Only";
const CHARM_BUNDLE_STYLES = ["Case + Grip + Charm", "Case + Charm"] as const;

function isCharmOnly(style: string): boolean {
  return style.trim().toLowerCase() === CHARM_ONLY.toLowerCase();
}

/**
 * Best photo tagged for one exact style. Does not fall back to another style
 * or the hero — callers decide that.
 */
function imageTaggedForStyle<T extends ConfirmationImage>(
  images: readonly T[],
  style: string,
  options: {
    customStyles?: readonly CustomStyle[];
    isolatedSourceImageId?: number | null;
  } | undefined,
  thumbnail: T | undefined,
): T | undefined {
  const source = options?.isolatedSourceImageId
    ? images.find((image) => image.id === options.isolatedSourceImageId)
    : undefined;
  if (thumbnail && depictedStyle(source?.styleTags) === style) return thumbnail;

  const linkedId = customStyleByLabel(options?.customStyles ?? [], style)?.imageId;
  const linked =
    linkedId != null ? images.find((image) => image.id === linkedId) : undefined;
  if (
    linked &&
    !isNormalizedThumbnail(linked.sourceFilename) &&
    isWhiteBackgroundFilename(linked.sourceFilename)
  ) {
    return linked;
  }

  const pack = images.find(
    (image) =>
      !isNormalizedThumbnail(image.sourceFilename) &&
      image.styleTags.includes(style) &&
      isWhiteBackgroundFilename(image.sourceFilename),
  );
  if (pack) return pack;

  if (linked && !isNormalizedThumbnail(linked.sourceFilename)) return linked;

  return images.find(
    (image) =>
      !isNormalizedThumbnail(image.sourceFilename) &&
      image.styleTags.includes(style),
  );
}

/**
 * Photo for the mobile confirmation row.
 *
 * Undefined only when nothing is selected or the listing has no images. Every
 * selected style gets a picture, so the buy box does not collapse between taps.
 */
export function confirmationImageForStyle<T extends ConfirmationImage>(
  images: readonly T[],
  selectedStyle: string | null | undefined,
  options?: {
    customStyles?: readonly CustomStyle[];
    /** Gallery image the approved cleaned thumbnail was cut from. */
    isolatedSourceImageId?: number | null;
  },
): T | undefined {
  if (!selectedStyle || images.length === 0) return undefined;

  const thumbnail = images.find((image) =>
    isNormalizedThumbnail(image.sourceFilename),
  );

  if (isCharmOnly(selectedStyle)) {
    for (const bundle of CHARM_BUNDLE_STYLES) {
      const borrowed = imageTaggedForStyle(images, bundle, options, thumbnail);
      if (borrowed) return borrowed;
    }
  }

  return (
    imageTaggedForStyle(images, selectedStyle, options, thumbnail) ??
    thumbnail ??
    images.find((image) => !isNormalizedThumbnail(image.sourceFilename)) ??
    images[0]
  );
}

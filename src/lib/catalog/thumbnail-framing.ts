/**
 * Find a gallery photo the free framing path is allowed to use.
 *
 * Candidates are the shots the vision scorer already called a clean product.
 * They are probed best-score first; the first one whose backdrop is flat
 * paper white wins. A dead URL is skipped — a later frame may still be good,
 * and the generative path reports an unreadable gallery on its own if nothing
 * here qualifies.
 */
import { probePlainBackdrop } from "@/lib/catalog/thumbnail-backdrop";
import { loadImage } from "@/lib/catalog/image-source";
import {
  forceGenerativeThumbnails,
  prefersLocalFraming,
  type FramingScore,
} from "@/lib/catalog/thumbnail-route";

/** Highest-scoring clean shots we will read before giving up and paying. */
const LOCAL_PROBE_LIMIT = 8;

export type LocalFrame<T> = T & { bytes: Buffer };

export async function findLocalFrame<T extends { url: string; score: FramingScore }>(
  images: readonly T[],
): Promise<LocalFrame<T> | null> {
  if (forceGenerativeThumbnails()) return null;

  const ranked = images
    .filter((image) => prefersLocalFraming(image.score))
    .sort((a, b) => b.score.score - a.score.score)
    .slice(0, LOCAL_PROBE_LIMIT);

  for (const image of ranked) {
    try {
      const loaded = await loadImage(image.url);
      const probe = await probePlainBackdrop(loaded.bytes);
      if (probe.trimmable) return { ...image, bytes: loaded.bytes };
    } catch {
      // Unreadable candidate. Keep looking.
    }
  }
  return null;
}

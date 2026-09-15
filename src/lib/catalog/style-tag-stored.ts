/**
 * Style-tag photos that already live in the catalogue (R2 / public URL).
 *
 * Ingest classifies from the WebP buffers it just converted. Everything else
 * — the AirPods backfill, the admin Detect control — has to read the stored
 * object first. This module is that read + classify path, so both callers
 * send the same pixels (`visionDataUrl`) through the same classifier.
 *
 * Node-only (Sharp + S3). Never import from a client component.
 */
import { classifyImageStyles } from "@/lib/ai";
import { mapWithConcurrency } from "./concurrency";
import {
  loadImages,
  visionDataUrl,
  type ImageFailure,
} from "./image-source";
import type { StyleClassifyContext } from "./style-classify";

const ENCODE_CONCURRENCY = 4;

export type StoredImageRef = {
  id: number;
  url: string;
  filename?: string | null;
};

export type StoredStyleClassification = {
  /** image id → at most one style; omitted ids were unreadable. */
  tagsById: Record<number, string[]>;
  tagged: number;
  universal: number;
  failures: ImageFailure[];
};

/**
 * Load each photo from storage, encode it the way ingest does, and ask the
 * vision classifier which offered style it depicts.
 */
export async function classifyStoredImageStyles(
  images: readonly StoredImageRef[],
  context: StyleClassifyContext,
): Promise<StoredStyleClassification> {
  if (images.length === 0) {
    return { tagsById: {}, tagged: 0, universal: 0, failures: [] };
  }

  const { images: loaded, failures } = await loadImages(
    images.map((img) => img.url),
  );
  const byUrl = new Map(loaded.map((img) => [img.url, img]));
  const readable = images.filter((img) => byUrl.has(img.url));

  const items = await mapWithConcurrency(
    readable,
    ENCODE_CONCURRENCY,
    async (img) => {
      const file = byUrl.get(img.url);
      if (!file) throw new Error(`Loaded image missing for ${img.url}`);
      return {
        id: img.id,
        filename: `id_${img.id}`,
        imageUrl: await visionDataUrl(file),
      };
    },
  );

  const styleMap = await classifyImageStyles(
    items.map(({ filename, imageUrl }) => ({ filename, imageUrl })),
    context,
  );

  const tagsById: Record<number, string[]> = {};
  let tagged = 0;
  let universal = 0;
  for (const item of items) {
    const tags = styleMap[item.filename] ?? [];
    tagsById[item.id] = tags;
    if (tags.length > 0) tagged += 1;
    else universal += 1;
  }

  return { tagsById, tagged, universal, failures };
}

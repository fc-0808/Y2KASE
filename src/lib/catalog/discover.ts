import fs from "node:fs";
import path from "node:path";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const VIDEO_EXTS = new Set([".mp4", ".mov", ".webm"]);

export function isImageFile(name: string): boolean {
  return IMAGE_EXTS.has(path.extname(name).toLowerCase());
}

export function isVideoFile(name: string): boolean {
  return VIDEO_EXTS.has(path.extname(name).toLowerCase());
}

/**
 * Natural, numeric-aware comparator for media filenames.
 *
 * A plain `.sort()` is lexicographic, so `["1","2","10"]` becomes
 * `["1","10","2"]`. Sellers number their photos `1.jpg, 2.mp4, 3.png …`, so we
 * compare by the file's basename using `localeCompare` with `numeric: true`,
 * which sorts `1, 2, 3, … 10, 11` the way a human expects.
 */
export function compareNatural(a: string, b: string): number {
  return path
    .basename(a)
    .localeCompare(path.basename(b), undefined, {
      numeric: true,
      sensitivity: "base",
    });
}

export type DiscoveredProductFolder = {
  /** Relative path from catalog root, e.g. "Miffy/10" */
  folderPath: string;
  absPath: string;
  /** Top-level collection name or parent chain for AI context */
  categoryHint: string;
  imageFiles: string[];
  videoFiles: string[];
};

function dirHasImages(dir: string): boolean {
  try {
    return fs.readdirSync(dir).some((f) => isImageFile(f));
  } catch {
    return false;
  }
}

/**
 * Recursively find product folders.
 *
 * Rule: a directory is ONE product when it contains image files directly and
 * no child subdirectory also contains images. This supports:
 *   bestListings/Miffy/10/*.PNG
 *   uploads/2026/Sanrio/SKU-123/*.jpg
 */
export function discoverProductFolders(root: string): DiscoveredProductFolder[] {
  const absRoot = path.resolve(root);
  const results: DiscoveredProductFolder[] = [];

  function walk(dir: string, rel: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const subdirs = entries.filter((e) => e.isDirectory());

    const imageFiles = entries
      .filter((e) => e.isFile() && isImageFile(e.name))
      .map((e) => path.join(dir, e.name))
      .sort(compareNatural);

    const videoFiles = entries
      .filter((e) => e.isFile() && isVideoFile(e.name))
      .map((e) => path.join(dir, e.name))
      .sort(compareNatural);

    const childWithImages = subdirs.filter((sd) =>
      dirHasImages(path.join(dir, sd.name)),
    );

    if (imageFiles.length > 0 && childWithImages.length === 0) {
      const parts = rel.split("/").filter(Boolean);
      const categoryHint =
        parts.length >= 2 ? parts.slice(0, -1).join(" / ") : parts[0] ?? "General";

      results.push({
        folderPath: rel,
        absPath: dir,
        categoryHint,
        imageFiles,
        videoFiles,
      });
      return;
    }

    for (const sd of subdirs) {
      const childRel = rel ? `${rel}/${sd.name}` : sd.name;
      walk(path.join(dir, sd.name), childRel);
    }
  }

  walk(absRoot, "");
  return results;
}

/**
 * Pick the primary product video from a folder.
 * Prefers `{folderBasename}.mp4`, then `2.mp4`, then the first video file.
 */
export function pickPrimaryVideo(
  videoFiles: string[],
  folderBasename: string,
): string | null {
  if (videoFiles.length === 0) return null;

  const byName = (name: string) =>
    videoFiles.find((f) => path.basename(f).toLowerCase() === name.toLowerCase());

  return (
    byName(`${folderBasename}.mp4`) ??
    byName("2.mp4") ??
    videoFiles[0] ??
    null
  );
}

/**
 * The zero-based slot a video should occupy within the ordered image gallery,
 * so the combined sequence matches the seller's folder numbering exactly.
 * It is the count of images that sort (naturally) before the video file.
 *
 * Example: folder = [1.jpg, 2.mp4, 3.png] → video slot = 1 (after image 1).
 */
export function videoSlotIndex(imageFiles: string[], videoFile: string): number {
  return imageFiles.filter((img) => compareNatural(img, videoFile) < 0).length;
}

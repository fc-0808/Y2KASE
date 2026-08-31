import fs from "node:fs";
import path from "node:path";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const VIDEO_EXTS = new Set([".mp4", ".mov", ".webm"]);

/**
 * Generator bookkeeping directories, never sellable products.
 *
 * The image-variant workflow writes one logical product like this:
 *
 *   foo_variants/
 *     01_front.jpg
 *     02_three_quarter.jpg
 *     variants.json
 *     _originals/original_07.jpg
 *     _removed/rejected.jpg
 *
 * `_originals` is a work-in-progress backup and `_removed` is explicitly
 * rejected media. Treating either as a product creates exactly the incident
 * this guard exists for: a one-photo listing while the real gallery in the
 * parent directory is skipped.
 */
export const INTERNAL_MEDIA_DIRECTORY_NAMES: ReadonlySet<string> =
  new Set<string>(["_originals", "_removed"]);

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

export type IgnoredMediaDirectory = {
  /** Relative path from the inspected root, using `/` separators. */
  folderPath: string;
  /** Images deliberately excluded from product discovery. */
  imageCount: number;
};

export type ProductDiscoveryReport = {
  folders: DiscoveredProductFolder[];
  ignoredMediaDirectories: IgnoredMediaDirectory[];
  ignoredImageCount: number;
  /** Directories that could not be read; callers should not ingest partially. */
  unreadableDirectories: string[];
};

export function isInternalMediaDirectory(name: string): boolean {
  return INTERNAL_MEDIA_DIRECTORY_NAMES.has(name.toLowerCase());
}

function countImagesRecursively(dir: string): number {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .reduce((count, entry) => {
        if (entry.isFile()) return count + Number(isImageFile(entry.name));
        if (entry.isDirectory()) {
          return count + countImagesRecursively(path.join(dir, entry.name));
        }
        return count;
      }, 0);
  } catch {
    return 0;
  }
}

/**
 * Recursively find product folders.
 *
 * Rule: a directory is ONE product when it contains image files directly and
 * no non-internal child directory contains product images. A `variants.json`
 * marker makes the directory an explicit product boundary. This supports:
 *   bestListings/Miffy/10/*.PNG
 *   uploads/2026/Sanrio/SKU-123/*.jpg
 *   output/foo_variants/{01_front.jpg,_originals/*,_removed/*}
 *
 * Generator-internal `_originals` / `_removed` directories are never traversed
 * as products. Their counts remain available in the report so Admin Upload can
 * tell the operator what was deliberately excluded.
 */
export function inspectProductFolders(root: string): ProductDiscoveryReport {
  const absRoot = path.resolve(root);
  const rootName = path.basename(absRoot);
  if (isInternalMediaDirectory(rootName)) {
    const imageCount = countImagesRecursively(absRoot);
    return {
      folders: [],
      ignoredMediaDirectories: [{ folderPath: rootName, imageCount }],
      ignoredImageCount: imageCount,
      unreadableDirectories: [],
    };
  }

  const results: DiscoveredProductFolder[] = [];
  const ignoredMediaDirectories: IgnoredMediaDirectory[] = [];
  const unreadableDirectories = new Set<string>();
  const containsImagesMemo = new Map<string, boolean>();

  function recordUnreadable(dir: string): void {
    const relative = path.relative(absRoot, dir).replace(/\\/g, "/");
    unreadableDirectories.add(relative || rootName || "catalog-root");
  }

  function containsProductImages(dir: string): boolean {
    const cached = containsImagesMemo.get(dir);
    if (cached !== undefined) return cached;

    let found = false;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      found =
        entries.some((entry) => entry.isFile() && isImageFile(entry.name)) ||
        entries.some(
          (entry) =>
            entry.isDirectory() &&
            !isInternalMediaDirectory(entry.name) &&
            containsProductImages(path.join(dir, entry.name)),
        );
    } catch {
      // Treat unreadable descendants as potentially containing products. That
      // prevents loose parent media from becoming a false product boundary.
      recordUnreadable(dir);
      found = true;
    }
    containsImagesMemo.set(dir, found);
    return found;
  }

  function walk(dir: string, rel: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      recordUnreadable(dir);
      return;
    }
    const allSubdirs = entries.filter((e) => e.isDirectory());
    const internalSubdirs = allSubdirs.filter((entry) =>
      isInternalMediaDirectory(entry.name),
    );
    const subdirs = allSubdirs.filter(
      (entry) => !isInternalMediaDirectory(entry.name),
    );

    for (const entry of internalSubdirs) {
      const imageCount = countImagesRecursively(path.join(dir, entry.name));
      if (imageCount === 0) continue;
      ignoredMediaDirectories.push({
        folderPath: rel ? `${rel}/${entry.name}` : entry.name,
        imageCount,
      });
    }

    const imageFiles = entries
      .filter((e) => e.isFile() && isImageFile(e.name))
      .map((e) => path.join(dir, e.name))
      .sort(compareNatural);

    const videoFiles = entries
      .filter((e) => e.isFile() && isVideoFile(e.name))
      .map((e) => path.join(dir, e.name))
      .sort(compareNatural);

    const hasVariantManifest = entries.some(
      (entry) =>
        entry.isFile() && entry.name.toLowerCase() === "variants.json",
    );
    const childWithImages = subdirs.filter((sd) =>
      containsProductImages(path.join(dir, sd.name)),
    );

    if (
      imageFiles.length > 0 &&
      (hasVariantManifest || childWithImages.length === 0)
    ) {
      // Selecting one product directory directly must still produce a stable
      // identity. An empty folderPath would collide in catalog.db across every
      // such run and produce a generic R2 prefix.
      const folderPath = rel || path.basename(absRoot) || "product";
      const parts = folderPath.split("/").filter(Boolean);
      const categoryHint =
        parts.length >= 2 ? parts.slice(0, -1).join(" / ") : parts[0] ?? "General";

      results.push({
        folderPath,
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
  return {
    folders: results,
    ignoredMediaDirectories,
    ignoredImageCount: ignoredMediaDirectories.reduce(
      (sum, item) => sum + item.imageCount,
      0,
    ),
    unreadableDirectories: [...unreadableDirectories].sort(compareNatural),
  };
}

export function discoverProductFolders(root: string): DiscoveredProductFolder[] {
  return inspectProductFolders(root).folders;
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
 * Pick up to `count` items spread across the list, always keeping the first
 * and the last. Sellers photograph the front first and the back last, so a
 * prefix sample would hide the evidence a classifier needs.
 */
export function sampleEvenly<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  const step = (items.length - 1) / (count - 1);
  return Array.from(
    new Set(Array.from({ length: count }, (_, i) => Math.round(i * step))),
  ).map((i) => items[i]);
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

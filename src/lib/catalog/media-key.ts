/**
 * Stable, collision-resistant object keys for locally ingested catalog media.
 *
 * Supplier folders are usually Chinese (and some arrive as mojibake). Replacing
 * every non-ASCII character with `_` collapses many different SKUs onto the
 * same R2 prefix, allowing one product to overwrite another. Human-readable
 * ASCII plus a hash keeps keys diagnosable without sacrificing identity.
 */
import crypto from "node:crypto";
import path from "node:path";

const SEGMENT_LABEL_MAX = 48;
const FILE_LABEL_MAX = 40;
const HASH_LENGTH = 12;

function digest(value: string): string {
  return crypto
    .createHash("sha256")
    .update(value.normalize("NFC"))
    .digest("hex")
    .slice(0, HASH_LENGTH);
}

function asciiLabel(value: string, max: number, fallback: string): string {
  const label = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return label || fallback;
}

/**
 * Convert a SKU or relative source path into safe R2 path segments.
 *
 * Every segment gets its own hash. Therefore two Chinese-only names both read
 * `product-…`, but can never share the same prefix.
 */
export function catalogMediaKeyBase(
  identity: string,
  namespace: string = identity,
): string {
  const segments = identity.split(/[\\/]+/).filter(Boolean);
  const source = segments.length > 0 ? segments : ["product"];
  return source
    .map(
      (segment, index) =>
        `${asciiLabel(segment, SEGMENT_LABEL_MAX, "product")}-${digest(
          `${namespace}\0${index}\0${segment}`,
        )}`,
    )
    .join("/");
}

/**
 * Stable WebP object name. The ordinal preserves gallery order in bucket
 * listings; hashing the full basename prevents `1.jpg` and `1.png` collisions.
 */
export function catalogImageObjectName(
  sourcePath: string,
  position: number,
): string {
  const basename = path.basename(sourcePath);
  const stem = path.parse(basename).name;
  const ordinal = String(position + 1).padStart(3, "0");
  return `${ordinal}-${asciiLabel(stem, FILE_LABEL_MAX, "image")}-${digest(basename)}.webp`;
}

/** The ingest stores one primary video; its source name still disambiguates it. */
export function catalogVideoObjectName(sourcePath: string): string {
  const basename = path.basename(sourcePath);
  const stem = path.parse(basename).name;
  const ext = path.extname(basename).toLowerCase() || ".mp4";
  return `video-${asciiLabel(stem, FILE_LABEL_MAX, "media")}-${digest(basename)}${ext}`;
}

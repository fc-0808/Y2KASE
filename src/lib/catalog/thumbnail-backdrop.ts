/**
 * Whether Sharp's trim can lift a product off its backdrop without a paid
 * cutout.
 *
 * `normalizeThumbnail` trims pixels close to the corner color, then centers
 * whatever remains on white. That is pixel-exact — and it is also blind. It
 * will happily keep a hand, a pink studio sweep, or the colored background
 * showing through a clear case. So this probe only answers "is the backdrop a
 * flat paper white?". Hands are the classifier's problem; this file never
 * sees them.
 *
 * Paper white is deliberate, not a tighter crop of "any flat color":
 *   • A clear case is mostly backdrop. Trimming a pink sweep leaves the pink
 *     inside the shell. On white, the shell already reads as white.
 *   • A light gray that is flat enough to trim still leaves a halo the
 *     storefront grid notices next to a true-white neighbor. Those stay on
 *     Nano Banana Pro.
 *
 * Sampled at 96px. The decision is about the backdrop, not the print.
 */
import sharp from "sharp";

const SAMPLE = 96;
const MIN_EDGE = 24;

/** Corner color must be neutral paper, not a tint and not a gray sweep. */
const PAPER_LUMA_MIN = 246;
const PAPER_CHROMA_MAX = 10;
/** Corners must describe one color. A scene fails here. */
const CORNER_DELTA_MAX = 10;

const BORDER_FRACTION = 0.08;
const BORDER_DELTA_MAX = 12;
const BORDER_MATCH_MIN = 0.94;

/** Interior pixel far enough from the paper to be the product, not a shadow. */
const SUBJECT_DELTA = 48;
const SUBJECT_MIN = 0.045;

/** Soft gray between paper and product — a shadow or a gradient. */
const SHADOW_DELTA_MIN = 13;
const SHADOW_DELTA_MAX = 48;
const SHADOW_MAX = 0.055;

export type BackdropProbe = {
  trimmable: boolean;
  borderMatch: number;
  subject: number;
  shadow: number;
};

const NOT_TRIMMABLE: BackdropProbe = {
  trimmable: false,
  borderMatch: 0,
  subject: 0,
  shadow: 0,
};

type Rgb = [number, number, number];

function maxDelta(a: Rgb, b: Rgb): number {
  return Math.max(
    Math.abs(a[0] - b[0]),
    Math.abs(a[1] - b[1]),
    Math.abs(a[2] - b[2]),
  );
}

function luma(rgb: Rgb): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function chroma(rgb: Rgb): number {
  return Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]);
}

function at(
  data: Buffer,
  width: number,
  channels: number,
  x: number,
  y: number,
): Rgb {
  const i = (y * width + x) * channels;
  return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
}

function isPaper(rgb: Rgb): boolean {
  return luma(rgb) >= PAPER_LUMA_MIN && chroma(rgb) <= PAPER_CHROMA_MAX;
}

/**
 * True when the outer band is flat paper white, the corners agree, and the
 * interior is a product rather than a shadow or an empty frame.
 *
 * Never throws — a decode failure is "not trimmable", which sends the product
 * down the paid path instead of failing the batch.
 */
export async function probePlainBackdrop(input: Buffer): Promise<BackdropProbe> {
  let data: Buffer;
  let width: number;
  let height: number;
  let channels: number;
  try {
    const decoded = await sharp(input)
      .rotate()
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .resize(SAMPLE, SAMPLE, { fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    data = decoded.data;
    width = decoded.info.width;
    height = decoded.info.height;
    channels = decoded.info.channels;
  } catch {
    return NOT_TRIMMABLE;
  }

  if (channels < 3 || width < MIN_EDGE || height < MIN_EDGE) return NOT_TRIMMABLE;

  const corners: Rgb[] = [
    at(data, width, channels, 0, 0),
    at(data, width, channels, width - 1, 0),
    at(data, width, channels, 0, height - 1),
    at(data, width, channels, width - 1, height - 1),
  ];
  const reference: Rgb = [
    Math.round(corners.reduce((sum, c) => sum + c[0], 0) / corners.length),
    Math.round(corners.reduce((sum, c) => sum + c[1], 0) / corners.length),
    Math.round(corners.reduce((sum, c) => sum + c[2], 0) / corners.length),
  ];
  if (!isPaper(reference)) return NOT_TRIMMABLE;
  if (corners.some((corner) => maxDelta(corner, reference) > CORNER_DELTA_MAX)) {
    return NOT_TRIMMABLE;
  }

  const band = Math.max(2, Math.round(Math.min(width, height) * BORDER_FRACTION));
  if (width <= band * 2 || height <= band * 2) return NOT_TRIMMABLE;

  let border = 0;
  let borderMatch = 0;
  let interior = 0;
  let subject = 0;
  let shadow = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const onBorder =
        x < band || y < band || x >= width - band || y >= height - band;
      const delta = maxDelta(at(data, width, channels, x, y), reference);
      if (onBorder) {
        border++;
        if (delta <= BORDER_DELTA_MAX) borderMatch++;
        continue;
      }
      interior++;
      if (delta > SUBJECT_DELTA) subject++;
      else if (delta >= SHADOW_DELTA_MIN && delta <= SHADOW_DELTA_MAX) shadow++;
    }
  }

  if (border === 0 || interior === 0) return NOT_TRIMMABLE;

  const borderRatio = borderMatch / border;
  const subjectRatio = subject / interior;
  const shadowRatio = shadow / interior;
  const trimmable =
    borderRatio >= BORDER_MATCH_MIN &&
    subjectRatio >= SUBJECT_MIN &&
    shadowRatio <= SHADOW_MAX;

  return {
    trimmable,
    borderMatch: borderRatio,
    subject: subjectRatio,
    shadow: shadowRatio,
  };
}

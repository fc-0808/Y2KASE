/**
 * Product-thumbnail framing.
 *
 * Takes a product image that already sits on a plain white background (produced
 * by the Nano Banana Pro cleanup step) and standardizes the FRAMING: trims the
 * white margin to the product's true bounding box, then centers it with uniform
 * padding on a portrait canvas whose aspect matches the storefront grid card.
 *
 * A portrait (4:5) frame lets a phone case — which is tall and narrow — fill far
 * more of the tile than a square would, so the product reads large and clear
 * (CASETiFY-style). Deterministic, no network, no Photoroom.
 *
 * Both the aspect ratio and the margin are env-tunable without a code change:
 *   THUMBNAIL_ASPECT  (default "4:5")   THUMBNAIL_PADDING (default 0.04)
 */
import sharp from "sharp";

/** Backdrop for every product thumbnail (matches the `--product-surface` token). */
export const PRODUCT_SURFACE = { r: 255, g: 255, b: 255, alpha: 1 } as const;

/** Target thumbnail aspect as "W:H" — portrait for a phone-forward grid. Matches
 *  the storefront card frame from `md` up (see ProductCard); below `md` the card
 *  narrows to 2:3 and deliberately crops this canvas's side margins. */
export const THUMBNAIL_ASPECT = process.env.THUMBNAIL_ASPECT ?? "4:5";

function parseAspect(s: string): { w: number; h: number } {
  const [w, h] = s.split(":").map(Number);
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { w, h };
  return { w: 4, h: 5 };
}

const ASPECT = parseAspect(THUMBNAIL_ASPECT);
const BASE_WIDTH = 1024;
const OUT_WIDTH = BASE_WIDTH;
const OUT_HEIGHT = Math.round((BASE_WIDTH * ASPECT.h) / ASPECT.w);

/** Margin around the product, as a fraction of the canvas per side. Small
 *  margin = the case fills the frame. Tunable via THUMBNAIL_PADDING (0–0.4). */
const DEFAULT_PADDING = (() => {
  const v = Number(process.env.THUMBNAIL_PADDING);
  return Number.isFinite(v) && v >= 0 && v <= 0.4 ? v : 0.04;
})();

export type NormalizeOptions = {
  /** Output width in px (height defaults to width × the target aspect). */
  width?: number;
  /** Output height in px. */
  height?: number;
  /** Fraction of the canvas kept as empty margin on each side (0–0.4). */
  padding?: number;
  /** Solid backdrop color the product is centered on. */
  background?: { r: number; g: number; b: number; alpha: number };
  /** WebP quality (1–100). */
  quality?: number;
};

const DEFAULTS = {
  width: OUT_WIDTH,
  height: OUT_HEIGHT,
  padding: DEFAULT_PADDING,
  background: PRODUCT_SURFACE,
  quality: 82,
} satisfies Required<NormalizeOptions>;

/**
 * Center a product image on a uniform portrait white canvas: trim the flat
 * white margin to the product's bounding box, scale to fit the padded content
 * box, and center. This makes every thumbnail identical in scale and position.
 *
 * We rely on the generation prompt for a pure-white backdrop and only `trim`
 * the uniform border here. We deliberately do NOT flood-fill light pixels to
 * white: for clear / transparent cases the see-through areas are light and
 * connected to the background, so flooding would wash out the case itself.
 */
export async function composeOnCanvas(
  input: Buffer,
  options: NormalizeOptions = {},
): Promise<Buffer> {
  const width = options.width ?? DEFAULTS.width;
  // Preserve the target aspect when only width is overridden.
  const height =
    options.height ??
    Math.round(width * (DEFAULTS.height / DEFAULTS.width));
  const padding = options.padding ?? DEFAULTS.padding;
  const background = options.background ?? DEFAULTS.background;
  const quality = options.quality ?? DEFAULTS.quality;
  const contentW = Math.max(1, Math.round(width * (1 - 2 * padding)));
  const contentH = Math.max(1, Math.round(height * (1 - 2 * padding)));

  // Trim the flat white border down to the product's real bounding box so every
  // product is scaled by its own size. Falls back to the untrimmed image.
  let subject: Buffer;
  try {
    subject = await sharp(input).trim({ threshold: 15 }).toBuffer();
  } catch {
    subject = input;
  }

  const resized = await sharp(subject)
    .resize(contentW, contentH, { fit: "inside", withoutEnlargement: false })
    .toBuffer();

  return sharp({
    create: { width, height, channels: 4, background },
  })
    .composite([{ input: resized, gravity: "center" }])
    .webp({ quality })
    .toBuffer();
}

/**
 * Standardize a cleaned (product-on-white) image into the final portrait
 * thumbnail. Background/hand removal is done upstream by the cleanup step.
 */
export async function normalizeThumbnail(
  input: Buffer,
  options: NormalizeOptions = {},
): Promise<Buffer> {
  return composeOnCanvas(input, options);
}

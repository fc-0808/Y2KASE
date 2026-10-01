/**
 * Render a listing-photo crop without touching storage.
 *
 * The browser sends a rectangle in the pixel space of the EXIF-oriented image
 * *after* the requested quarter turn — the frame the operator dragged in.
 * `renderListingCrop` reproduces that frame with auto-orient, then rotate,
 * then extract, so the preview and the file agree.
 *
 * Output is WebP. Catalog photos are content-addressed objects, so a crop is
 * a new key rather than an in-place rewrite of the supplier file. Callers
 * keep the first URL as the pristine original and point the row at the new one.
 */
import sharp from "sharp";
import {
  frameSize,
  isNoop,
  normaliseCrop,
  normaliseRotation,
  type PixelRect,
  type QuarterTurn,
} from "./crop-geometry";

export type ListingCropSpec = Partial<PixelRect> & { rotate?: number };

export type ListingCropRender = {
  changed: boolean;
  bytes: Buffer;
  width: number;
  height: number;
  rotation: QuarterTurn;
  rect: PixelRect;
};

/** WebP settings favour fidelity. A softened product photo costs more than the bytes. */
const WEBP_QUALITY = 92;

function orientedSize(meta: {
  width?: number;
  height?: number;
  orientation?: number;
}): { width: number; height: number } {
  const storedW = meta.width;
  const storedH = meta.height;
  if (
    !Number.isFinite(storedW) ||
    !Number.isFinite(storedH) ||
    !storedW ||
    !storedH ||
    storedW < 1 ||
    storedH < 1
  ) {
    throw new Error("That file could not be read as an image.");
  }
  const orientation = meta.orientation ?? 1;
  const transposed = orientation >= 5 && orientation <= 8;
  return transposed
    ? { width: storedH, height: storedW }
    : { width: storedW, height: storedH };
}

/**
 * Crop and optionally rotate `bytes`. A full-frame, unrotated request returns
 * the original buffer with `changed: false` so we do not spend a generation
 * of quality on a no-op.
 */
export async function renderListingCrop(
  bytes: Buffer,
  spec: ListingCropSpec,
): Promise<ListingCropRender> {
  let meta: { width?: number; height?: number; orientation?: number };
  try {
    meta = await sharp(bytes, { failOn: "none" }).metadata();
  } catch {
    throw new Error("That file could not be read as an image.");
  }
  const oriented = orientedSize(meta);
  const rotation = normaliseRotation(spec.rotate ?? 0);
  const frame = frameSize(oriented, rotation);
  const rect = normaliseCrop(spec, frame);
  const base = { rotation, rect };

  if (isNoop(rect, frame, rotation)) {
    return {
      ...base,
      changed: false,
      bytes,
      width: frame.width,
      height: frame.height,
    };
  }

  // `animated: false` stays on the first frame. Extracting an animated
  // filmstrip would slice through every frame.
  let pipeline = sharp(bytes, { failOn: "none", animated: false }).rotate();
  if (rotation) pipeline = pipeline.rotate(rotation);
  pipeline = pipeline.extract(rect);
  // Carry the colour profile through. Other metadata — notably the EXIF
  // orientation tag, which is now baked into the pixels — is dropped.
  if (typeof pipeline.keepIccProfile === "function") {
    pipeline = pipeline.keepIccProfile();
  }

  let out;
  try {
    out = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer({
      resolveWithObject: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    throw new Error(`Could not crop this photo: ${message}`);
  }
  if (!out.data.length) throw new Error("Cropping produced an empty image.");
  return {
    ...base,
    changed: true,
    bytes: out.data,
    width: out.info.width,
    height: out.info.height,
  };
}

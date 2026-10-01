/**
 * Crop-studio geometry.
 *
 * Every function works in image pixels of the frame currently on screen — the
 * photo after its quarter turn — never in CSS pixels. The view is re-scaled
 * when the window resizes; the composition must not shift when it does. The
 * studio converts pointer positions into this space once, on the way in.
 *
 * The rectangle sent to the server is that same space: the EXIF-oriented image
 * after the requested rotation, which is exactly the frame the operator dragged
 * in, because browsers auto-orient `<img>` too.
 *
 * Pure on purpose. The cases that bite — an aspect lock dragged into a frame
 * edge, a zero-length drag, a rect carried through a rotation — are unit-tested
 * without Sharp, the DOM, or a network.
 */

/** Smallest crop we will render, per side, in source pixels. */
export const MIN_CROP_SIDE = 48;

/** Quarter turns are the only rotations offered — no resampling, no guesswork. */
export type QuarterTurn = 0 | 90 | 180 | 270;

export type ImageRect = { x: number; y: number; w: number; h: number };
export type ImageFrame = { w: number; h: number };
export type PixelRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};
export type OrientedSize = { width: number; height: number };

export type CropHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

const QUARTER_TURNS = new Set<number>([0, 90, 180, 270]);

export class CropGeometryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CropGeometryError";
  }
}

/** Clamp `v` into [lo, hi]. Non-finite input collapses to `lo`. */
export function clampNumber(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  if (hi < lo) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Coerce a requested rotation to one of the four quarter turns.
 * Anything unrecognised means "don't rotate" rather than an error — a bad
 * rotation should never be able to fail an otherwise valid crop.
 */
export function normaliseRotation(raw: number): QuarterTurn {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 0;
  const deg = ((n % 360) + 360) % 360;
  return QUARTER_TURNS.has(deg) ? (deg as QuarterTurn) : 0;
}

/**
 * The frame the operator sees: source dimensions after EXIF orientation and
 * after the requested quarter turn.
 */
export function frameSize(
  oriented: OrientedSize,
  rotation: QuarterTurn,
): OrientedSize {
  return rotation === 90 || rotation === 270
    ? { width: oriented.height, height: oriented.width }
    : { width: oriented.width, height: oriented.height };
}

/**
 * Carry a crop rect through a quarter turn of the photo.
 * `dir` +1 is clockwise, -1 is anticlockwise.
 */
export function rotateRect(
  rect: ImageRect,
  frame: ImageFrame,
  dir: 1 | -1,
): { rect: ImageRect; frame: ImageFrame } {
  const turned = { w: frame.h, h: frame.w };
  const moved =
    dir > 0
      ? {
          x: frame.h - (rect.y + rect.h),
          y: rect.x,
          w: rect.h,
          h: rect.w,
        }
      : {
          x: rect.y,
          y: frame.w - (rect.x + rect.w),
          w: rect.h,
          h: rect.w,
        };
  return { rect: moved, frame: turned };
}

/**
 * Re-shape a rect to `aspect` (width ÷ height): the largest such rect that
 * fits both inside `rect` and inside the frame, kept on `rect`'s centre.
 * A null aspect means "free" and returns the rect unchanged.
 */
export function fitAspect(
  rect: ImageRect,
  frame: ImageFrame,
  aspect: number | null,
): ImageRect {
  if (aspect == null || !Number.isFinite(aspect) || aspect <= 0) {
    return { ...rect };
  }
  let w = rect.w;
  let h = rect.h;
  if (w / h > aspect) w = h * aspect;
  else h = w / aspect;
  const shrink = Math.min(1, frame.w / w, frame.h / h);
  w *= shrink;
  h *= shrink;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return {
    x: clampNumber(cx - w / 2, 0, frame.w - w),
    y: clampNumber(cy - h / 2, 0, frame.h - h),
    w,
    h,
  };
}

/** Translate a rect, keeping every edge inside the frame. */
export function moveRect(
  rect: ImageRect,
  frame: ImageFrame,
  dx: number,
  dy: number,
): ImageRect {
  return {
    x: clampNumber(rect.x + dx, 0, Math.max(0, frame.w - rect.w)),
    y: clampNumber(rect.y + dy, 0, Math.max(0, frame.h - rect.h)),
    w: rect.w,
    h: rect.h,
  };
}

/**
 * Resize a rect by dragging `handle` to the image-space point (px, py).
 *
 * Free mode moves the dragged edges. With an aspect lock the maths is
 * anchored on the opposite corner (or, for an edge handle, the opposite
 * edge's midpoint): the pointer sets one extent, the ratio sets the other,
 * then the pair is scaled down to the room left before the frame edge.
 */
export function resizeRect(
  rect: ImageRect,
  frame: ImageFrame,
  handle: string,
  px: number,
  py: number,
  minSide: number,
  aspect: number | null,
): ImageRect {
  const min = Math.max(1, Math.min(minSide || 1, frame.w, frame.h));
  const x = clampNumber(px, 0, frame.w);
  const y = clampNumber(py, 0, frame.h);
  const west = handle.includes("w");
  const east = handle.includes("e");
  const north = handle.includes("n");
  const south = handle.includes("s");
  if (!west && !east && !north && !south) return { ...rect };

  let l = rect.x;
  let t = rect.y;
  let r = rect.x + rect.w;
  let b = rect.y + rect.h;

  if (aspect == null || !Number.isFinite(aspect) || aspect <= 0) {
    if (west) l = clampNumber(x, 0, r - min);
    if (east) r = clampNumber(x, l + min, frame.w);
    if (north) t = clampNumber(y, 0, b - min);
    if (south) b = clampNumber(y, t + min, frame.h);
    return { x: l, y: t, w: r - l, h: b - t };
  }

  const ax = west ? r : east ? l : (l + r) / 2;
  const ay = north ? b : south ? t : (t + b) / 2;

  let w = east || west ? Math.abs(x - ax) : rect.w;
  let h = north || south ? Math.abs(y - ay) : rect.h;
  if (!east && !west) w = h * aspect;
  else if (!north && !south) h = w / aspect;
  else if (w / aspect >= h) h = w / aspect;
  else w = h * aspect;
  w = Math.max(w, 1e-6);
  h = Math.max(h, 1e-6);

  const roomW = east
    ? frame.w - ax
    : west
      ? ax
      : Math.min(ax, frame.w - ax) * 2;
  const roomH = south
    ? frame.h - ay
    : north
      ? ay
      : Math.min(ay, frame.h - ay) * 2;
  const shrink = Math.min(1, roomW / w, roomH / h);
  w *= shrink;
  h *= shrink;
  const grow = Math.max(1, min / w, min / h);
  w *= grow;
  h *= grow;
  if (w > roomW + 1e-6 || h > roomH + 1e-6) return { ...rect };

  const nx = east ? ax : west ? ax - w : ax - w / 2;
  const ny = south ? ay : north ? ay - h : ay - h / 2;
  return {
    x: clampNumber(nx, 0, Math.max(0, frame.w - w)),
    y: clampNumber(ny, 0, Math.max(0, frame.h - h)),
    w,
    h,
  };
}

/**
 * Snap a rect to whole pixels inside the frame — the integer rectangle the
 * server is asked to extract.
 */
export function roundRect(rect: ImageRect, frame: ImageFrame): PixelRect {
  const fw = Math.max(1, Math.round(frame.w));
  const fh = Math.max(1, Math.round(frame.h));
  const left = clampNumber(Math.round(rect.x), 0, fw - 1);
  const top = clampNumber(Math.round(rect.y), 0, fh - 1);
  return {
    left,
    top,
    width: clampNumber(Math.round(rect.w), 1, fw - left),
    height: clampNumber(Math.round(rect.h), 1, fh - top),
  };
}

/** True when this rect + rotation would reproduce the photo unchanged. */
export function isWholePhoto(
  rect: ImageRect,
  frame: ImageFrame,
  rotate: number,
): boolean {
  const snapped = roundRect(rect, frame);
  return (
    !rotate &&
    snapped.left === 0 &&
    snapped.top === 0 &&
    snapped.width === Math.round(frame.w) &&
    snapped.height === Math.round(frame.h)
  );
}

/**
 * Snap a requested rectangle to whole pixels inside `frame`.
 *
 * The browser measures in CSS pixels and divides by a fractional scale, so its
 * numbers land a fraction off the edge routinely. Clamping (rather than
 * rejecting) is deliberate: a one-pixel rounding disagreement must not fail an
 * operator's crop. Only a genuinely unusable rectangle — smaller than
 * {@link MIN_CROP_SIDE} — is an error.
 */
export function normaliseCrop(
  spec: Partial<PixelRect> | null | undefined,
  frame: OrientedSize,
): PixelRect {
  const fw = Math.max(1, Math.round(frame.width));
  const fh = Math.max(1, Math.round(frame.height));
  const s = spec ?? {};
  const left = clampNumber(Math.round(Number(s.left)), 0, fw - 1);
  const top = clampNumber(Math.round(Number(s.top)), 0, fh - 1);
  const width = clampNumber(Math.round(Number(s.width ?? fw)), 1, fw - left);
  const height = clampNumber(Math.round(Number(s.height ?? fh)), 1, fh - top);

  const min = Math.min(MIN_CROP_SIDE, fw, fh);
  if (width < min || height < min) {
    throw new CropGeometryError(
      `That crop is too small — keep at least ${min}×${min} pixels.`,
    );
  }
  return { left, top, width, height };
}

/** True when this crop and rotation would reproduce the source unchanged. */
export function isNoop(
  rect: PixelRect,
  frame: OrientedSize,
  rotation: QuarterTurn,
): boolean {
  return (
    rotation === 0 &&
    rect.left === 0 &&
    rect.top === 0 &&
    rect.width === Math.round(frame.width) &&
    rect.height === Math.round(frame.height)
  );
}

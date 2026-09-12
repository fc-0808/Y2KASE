/**
 * Fresh Pinterest pin graphics — 1000×1500 branded cards.
 *
 * Pinterest defines a "fresh pin" as a new image or video it has never seen.
 * Dumping the catalog JPEG as-is therefore cannot recover an account that
 * already published those bytes (organic pins AND the Shopping catalog feed).
 * Wrapping the REAL product photo in a 2:3 card with a short overlay:
 *   - creates new image bytes (fresh-pin signal);
 *   - fills the mobile feed (2:3 is the spec; square/horizontal stills crop);
 *   - keeps the product as the hero so the Visit Site quality check still
 *     matches the PDP.
 *
 * Failure is non-fatal: callers fall back to the original catalog URL.
 */

import sharp from "sharp";
import { makeR2Client, uploadImageToR2 } from "@/lib/catalog/r2";
import {
  PINTEREST_PIN_HEIGHT,
  PINTEREST_PIN_WIDTH,
  pinOverlayLines,
} from "@/lib/social/pinterest-strategy";

const BG = "#F4D4E8";
const INK = "#2B1A32";
const ACCENT = "#E60023";
const PANEL = "#FFFFFF";

const PHOTO_BOX = { width: 880, height: 1040, top: 56, left: 60 };
const BAND_TOP = 1220;

function escapeSvg(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function overlaySvg(lines: string[]): Buffer {
  const line1 = escapeSvg(lines[0] ?? "");
  const line2 = escapeSvg(lines[1] ?? "");
  const markup = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${PINTEREST_PIN_WIDTH}" height="${PINTEREST_PIN_HEIGHT}" viewBox="0 0 ${PINTEREST_PIN_WIDTH} ${PINTEREST_PIN_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect x="40" y="${BAND_TOP}" width="920" height="236" rx="28" fill="${PANEL}"/>
  <text x="80" y="${BAND_TOP + 78}" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700" fill="${INK}">${line1}</text>
  ${
    line2
      ? `<text x="80" y="${BAND_TOP + 132}" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700" fill="${INK}">${line2}</text>`
      : ""
  }
  <text x="80" y="${BAND_TOP + 196}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="${ACCENT}" letter-spacing="3">Y2KASE</text>
</svg>`;
  return Buffer.from(markup);
}

export type ComposedPinCard = {
  buffer: Buffer;
  contentType: "image/jpeg";
};

/**
 * Composite a catalog photo onto a 2:3 branded canvas. The product is
 * letterboxed (contain, never cover-crop) so shoppers see the whole case.
 */
export async function composePinCard(opts: {
  sourceImage: Buffer;
  overlayTitle: string;
}): Promise<ComposedPinCard> {
  const lines = pinOverlayLines(opts.overlayTitle);
  const photo = await sharp(opts.sourceImage)
    .rotate()
    .resize({
      width: PHOTO_BOX.width,
      height: PHOTO_BOX.height,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  const meta = await sharp(photo).metadata();
  const photoW = meta.width ?? PHOTO_BOX.width;
  const photoH = meta.height ?? PHOTO_BOX.height;
  const left = PHOTO_BOX.left + Math.round((PHOTO_BOX.width - photoW) / 2);
  const top = PHOTO_BOX.top + Math.round((PHOTO_BOX.height - photoH) / 2);

  const buffer = await sharp({
    create: {
      width: PINTEREST_PIN_WIDTH,
      height: PINTEREST_PIN_HEIGHT,
      channels: 3,
      background: BG,
    },
  })
    .composite([
      { input: photo, left, top },
      { input: overlaySvg(lines), left: 0, top: 0 },
    ])
    .jpeg({ quality: 85 })
    .toBuffer();

  return { buffer, contentType: "image/jpeg" };
}

function isR2Ready(): boolean {
  return Boolean(
    process.env.R2_BUCKET_NAME &&
      process.env.R2_PUBLIC_URL &&
      process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}

/**
 * Fetch the catalog photo, compose a fresh 2:3 pin, persist it to R2.
 * Returns the public URL, or null when composition / upload cannot run.
 */
export async function renderFreshPinImage(opts: {
  sourceImageUrl: string;
  overlayTitle: string;
  productId: number;
  sourceImageId: number;
}): Promise<string | null> {
  if (!isR2Ready()) return null;
  const res = await fetch(opts.sourceImageUrl);
  if (!res.ok) {
    throw new Error(
      `Could not fetch source photo (${res.status}) from ${opts.sourceImageUrl}`,
    );
  }
  const source = Buffer.from(await res.arrayBuffer());
  const card = await composePinCard({
    sourceImage: source,
    overlayTitle: opts.overlayTitle,
  });
  const bucket = process.env.R2_BUCKET_NAME!;
  const key = `social/pins/${opts.productId}/${opts.sourceImageId}-${Date.now()}.jpg`;
  const r2 = makeR2Client();
  return uploadImageToR2(r2, bucket, key, card.buffer, card.contentType);
}

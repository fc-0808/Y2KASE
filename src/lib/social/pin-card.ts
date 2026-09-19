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
 * Overlay text is rasterized with next/og (bundled Latin font). Sharp's SVG
 * `<text font-family="Arial">` has no Arial on Vercel, so every glyph became
 * a tofu square (□□□) on production pins.
 *
 * Failure is non-fatal: callers fall back to the original catalog URL.
 */

import { createElement } from "react";
import { ImageResponse } from "next/og";
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
const BAND = { left: 40, top: 1220, width: 920, height: 236 };

/**
 * White caption band with real letters. next/og ships a font; do not hand SVG
 * text to sharp/librsvg on the serverless image.
 */
async function overlayBandPng(lines: string[]): Promise<Buffer> {
  const lineNodes = lines.slice(0, 2).map((line) =>
    createElement(
      "div",
      {
        style: {
          display: "flex",
          fontSize: 42,
          fontWeight: 700,
          color: INK,
          lineHeight: 1.15,
        },
      },
      line,
    ),
  );
  const img = new ImageResponse(
    createElement(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: PANEL,
          borderRadius: 28,
          paddingLeft: 40,
          paddingRight: 28,
        },
      },
      ...lineNodes,
      createElement(
        "div",
        {
          style: {
            display: "flex",
            fontSize: 22,
            fontWeight: 700,
            color: ACCENT,
            letterSpacing: 3,
            marginTop: 12,
          },
        },
        "Y2KASE",
      ),
    ),
    { width: BAND.width, height: BAND.height },
  );
  return Buffer.from(await img.arrayBuffer());
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
  const band = await overlayBandPng(lines);

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
      { input: band, left: BAND.left, top: BAND.top },
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

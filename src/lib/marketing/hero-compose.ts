/**
 * Pixel-safe campaign hero composition.
 *
 * This module intentionally has no image-model dependency. It decodes the exact
 * catalogue image bytes, changes only orientation/scale/encoding, and places
 * each complete image inside a deterministic card. Never replace this with an
 * image-to-image model: reference conditioning cannot guarantee product truth.
 *
 * Node-only (Sharp). Do not import from a client component.
 */
import sharp from "sharp";
import {
  MARKETING_HERO_OUTPUT,
  MARKETING_HERO_REFERENCE_LIMIT,
  type MarketingHeroStyle,
} from "./hero";

type CardRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function marketingHeroCardLayout(count: number): CardRect[] {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > MARKETING_HERO_REFERENCE_LIMIT
  ) {
    throw new Error(
      `Campaign hero composition requires 1–${MARKETING_HERO_REFERENCE_LIMIT} images.`,
    );
  }
  const gap = count === 4 ? 10 : 20;
  const availableWidth = count === 1 ? 620 : 1120;
  const cardWidth = Math.floor(
    (availableWidth - gap * (count - 1)) / count,
  );
  const cardHeight = 620;
  const rowWidth = cardWidth * count + gap * (count - 1);
  const start = Math.round((MARKETING_HERO_OUTPUT.width - rowWidth) / 2);
  return Array.from({ length: count }, (_, index) => ({
    left: start + index * (cardWidth + gap),
    top: 50,
    width: cardWidth,
    height: cardHeight,
  }));
}

function palette(style: MarketingHeroStyle): {
  start: string;
  middle: string;
  end: string;
  glowA: string;
  glowB: string;
  accent: string;
  surface: string;
  gridOpacity: number;
} {
  switch (style) {
    case "clean-studio":
      return {
        start: "#fffdf8",
        middle: "#eaf5ff",
        end: "#f3eafa",
        glowA: "#ffd9c7",
        glowB: "#c9edff",
        accent: "#aaa3e8",
        surface: "#f9f7ff",
        gridOpacity: 0.2,
      };
    case "holographic-editorial":
      return {
        start: "#e9e4ff",
        middle: "#d7f8ff",
        end: "#ffe4ef",
        glowA: "#fff0a8",
        glowB: "#b9d8ff",
        accent: "#ff62b6",
        surface: "#eee8ff",
        gridOpacity: 0.14,
      };
    default:
      return {
        start: "#f1edff",
        middle: "#ddf7ff",
        end: "#ffe3ef",
        glowA: "#ffd7a8",
        glowB: "#c5b9ff",
        accent: "#ff62ad",
        surface: "#f5e8ff",
        gridOpacity: 0.16,
      };
  }
}

function styleArtwork(style: MarketingHeroStyle, accent: string): string {
  switch (style) {
    case "clean-studio":
      return `
        <path d="M80 560 C280 445 450 465 605 535 C775 610 980 590 1145 470"
          fill="none" stroke="#ffffff" stroke-width="58" stroke-linecap="round" opacity="0.34" />
        <path d="M85 562 C285 447 450 467 605 537 C775 612 980 592 1145 472"
          fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" opacity="0.28" />
        <circle cx="1065" cy="135" r="64" fill="none" stroke="#ffffff" stroke-width="20" opacity="0.32" />`;
    case "holographic-editorial":
      return `
        <path d="M-80 510 C210 300 400 635 650 430 C865 255 1010 425 1280 245"
          fill="none" stroke="url(#ribbon)" stroke-width="110" stroke-linecap="round"
          opacity="0.36" filter="url(#softBlur)" />
        <path d="M-90 535 C210 325 415 655 665 452 C885 275 1030 445 1290 265"
          fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.56" />
        <circle cx="100" cy="130" r="62" fill="none" stroke="${accent}" stroke-width="8" opacity="0.24" />
        <circle cx="100" cy="130" r="42" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.65" />`;
    default:
      return `
        <path d="M-120 545 C165 350 400 615 625 455 C845 300 1040 405 1305 235"
          fill="none" stroke="url(#ribbon)" stroke-width="96" stroke-linecap="round"
          opacity="0.28" filter="url(#softBlur)" />
        <path d="M40 585 C235 475 425 530 590 600 C770 675 980 615 1160 505"
          fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.48" />
        <circle cx="1080" cy="135" r="76" fill="none" stroke="#ffffff" stroke-width="22" opacity="0.2" />`;
  }
}

function backgroundSvg(
  style: MarketingHeroStyle,
  cards: readonly CardRect[],
): Buffer {
  const colors = palette(style);
  const pedestals = cards
    .map(
      (card) => `
        <ellipse cx="${card.left + card.width / 2}" cy="${card.top + card.height - 25}"
          rx="${Math.max(72, card.width * 0.38)}" ry="28"
          fill="#583852" opacity="0.16" filter="url(#blur)" />`,
    )
    .join("");
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${MARKETING_HERO_OUTPUT.width}" height="${MARKETING_HERO_OUTPUT.height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${colors.start}" />
          <stop offset="48%" stop-color="${colors.middle}" />
          <stop offset="100%" stop-color="${colors.end}" />
        </linearGradient>
        <linearGradient id="ribbon" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${colors.glowA}" />
          <stop offset="35%" stop-color="#ffffff" />
          <stop offset="68%" stop-color="${colors.glowB}" />
          <stop offset="100%" stop-color="${colors.accent}" />
        </linearGradient>
        <linearGradient id="surface" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.08" />
          <stop offset="100%" stop-color="${colors.surface}" stop-opacity="0.72" />
        </linearGradient>
        <radialGradient id="glowA">
          <stop offset="0%" stop-color="${colors.glowA}" stop-opacity="0.86" />
          <stop offset="100%" stop-color="${colors.glowA}" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="glowB">
          <stop offset="0%" stop-color="${colors.glowB}" stop-opacity="0.82" />
          <stop offset="100%" stop-color="${colors.glowB}" stop-opacity="0" />
        </radialGradient>
        <pattern id="grid" width="72" height="72" patternUnits="userSpaceOnUse">
          <path d="M72 0 H0 V72" fill="none" stroke="#ffffff" stroke-width="1" />
        </pattern>
        <filter id="blur" x="-30%" y="-100%" width="160%" height="300%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
        <filter id="softBlur" x="-25%" y="-50%" width="150%" height="200%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)" />
      <ellipse cx="1050" cy="85" rx="390" ry="310" fill="url(#glowA)" />
      <ellipse cx="95" cy="650" rx="360" ry="300" fill="url(#glowB)" />
      <rect width="100%" height="100%" fill="url(#grid)" opacity="${colors.gridOpacity}" />
      <path d="M0 455 C235 415 410 485 610 450 C820 415 1020 350 1200 395 V720 H0 Z"
        fill="url(#surface)" />
      <path d="M0 455 C235 415 410 485 610 450 C820 415 1020 350 1200 395"
        fill="none" stroke="#ffffff" stroke-width="2" opacity="0.52" />
      <rect x="24" y="22" width="1152" height="676" rx="54"
        fill="#ffffff" opacity="0.055" stroke="#ffffff" stroke-width="2" stroke-opacity="0.3" />
      ${styleArtwork(style, colors.accent)}
      <path d="M72 105 l8 20 20 8-20 8-8 20-8-20-20-8 20-8z" fill="#ffffff" opacity="0.86" />
      <path d="M1105 184 l6 15 15 6-15 6-6 15-6-15-15-6 15-6z" fill="#ffffff" opacity="0.78" />
      <path d="M1045 600 l5 12 12 5-12 5-5 12-5-12-12-5 12-5z" fill="${colors.accent}" opacity="0.45" />
      <circle cx="172" cy="602" r="7" fill="#ffffff" opacity="0.85" />
      <circle cx="1125" cy="550" r="10" fill="${colors.glowA}" opacity="0.75" />
      ${pedestals}
    </svg>
  `);
}

export type PreparedCatalogProduct = {
  bytes: Buffer;
  cutout: boolean;
};

/**
 * Remove only near-white pixels connected to the outer edge.
 *
 * A global "make white transparent" pass would erase white character artwork
 * and clear-case highlights. Flooding from the border preserves enclosed white
 * product details while clearing the catalogue canvas around the item.
 */
export async function prepareCatalogProduct(
  source: Buffer,
): Promise<PreparedCatalogProduct> {
  const decoded = await sharp(source)
    .rotate()
    .resize({
      width: 640,
      height: 620,
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const data = Buffer.from(decoded.data);
  const { width, height, channels } = decoded.info;
  const pixelCount = width * height;
  const cornerIndexes = [
    0,
    width - 1,
    (height - 1) * width,
    height * width - 1,
  ];
  const corners = cornerIndexes.map((pixel) => {
    const offset = pixel * channels;
    return {
      r: data[offset]!,
      g: data[offset + 1]!,
      b: data[offset + 2]!,
      a: data[offset + 3]!,
    };
  });
  const transparentCorners = corners.filter((corner) => corner.a < 24);
  const lightCorners = corners.filter((corner) => {
    const max = Math.max(corner.r, corner.g, corner.b);
    const min = Math.min(corner.r, corner.g, corner.b);
    return corner.a >= 24 && min >= 215 && max - min <= 35;
  });
  if (transparentCorners.length < 3 && lightCorners.length < 3) {
    return {
      bytes: await sharp(data, {
        raw: { width, height, channels },
      })
        .png()
        .toBuffer(),
      cutout: false,
    };
  }

  const background =
    lightCorners.length >= 3
      ? {
          r: Math.round(
            lightCorners.reduce((sum, corner) => sum + corner.r, 0) /
              lightCorners.length,
          ),
          g: Math.round(
            lightCorners.reduce((sum, corner) => sum + corner.g, 0) /
              lightCorners.length,
          ),
          b: Math.round(
            lightCorners.reduce((sum, corner) => sum + corner.b, 0) /
              lightCorners.length,
          ),
        }
      : { r: 255, g: 255, b: 255 };
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let read = 0;
  let write = 0;
  let cleared = 0;

  const qualifies = (pixel: number) => {
    const offset = pixel * channels;
    if (data[offset + 3]! < 24) return true;
    const r = data[offset]!;
    const g = data[offset + 1]!;
    const b = data[offset + 2]!;
    const brightness = (r + g + b) / 3;
    const distance = Math.max(
      Math.abs(r - background.r),
      Math.abs(g - background.g),
      Math.abs(b - background.b),
    );
    return brightness >= 205 && distance <= 38;
  };
  const enqueue = (pixel: number) => {
    if (visited[pixel] || !qualifies(pixel)) return;
    visited[pixel] = 1;
    queue[write] = pixel;
    write += 1;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (read < write) {
    const pixel = queue[read]!;
    read += 1;
    const offset = pixel * channels;
    const originalAlpha = data[offset + 3]!;
    const distance = Math.max(
      Math.abs(data[offset]! - background.r),
      Math.abs(data[offset + 1]! - background.g),
      Math.abs(data[offset + 2]! - background.b),
    );
    const featheredAlpha =
      originalAlpha < 24
        ? 0
        : Math.max(0, Math.min(255, Math.round(((distance - 8) / 30) * 255)));
    data[offset + 3] = Math.min(originalAlpha, featheredAlpha);
    cleared += 1;

    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < width) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y + 1 < height) enqueue(pixel + width);
  }

  if (cleared < pixelCount * 0.02) {
    return {
      bytes: await sharp(data, {
        raw: { width, height, channels },
      })
        .png()
        .toBuffer(),
      cutout: false,
    };
  }
  const transparent = await sharp(data, {
    raw: { width, height, channels },
  })
    .png()
    .toBuffer();
  return {
    bytes: await sharp(transparent)
      .trim({
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        threshold: 2,
      })
      .png()
      .toBuffer(),
    cutout: true,
  };
}

async function emailSafeJpeg(source: Buffer): Promise<Buffer> {
  const qualities = [82, 76, 70, 64, 58];
  for (const quality of qualities) {
    const encoded = await sharp(source)
      .rotate()
      .flatten({ background: "#f7e7f6" })
      .resize(MARKETING_HERO_OUTPUT.width, MARKETING_HERO_OUTPUT.height, {
        fit: "cover",
        position: "centre",
      })
      .toColourspace("srgb")
      .jpeg({
        quality,
        progressive: false,
        chromaSubsampling: "4:2:0",
        optimiseCoding: true,
      })
      .toBuffer();
    if (encoded.byteLength <= MARKETING_HERO_OUTPUT.maxBytes) return encoded;
  }
  throw new Error(
    `Campaign hero could not be compressed below ${Math.round(
      MARKETING_HERO_OUTPUT.maxBytes / 1024,
    )} KB.`,
  );
}

/**
 * Produce the final baseline JPEG from exact source-image bytes.
 * `fit: contain` is deliberate: no product edge is cropped.
 */
export async function composeCatalogMarketingHero(
  sources: readonly Buffer[],
  style: MarketingHeroStyle,
): Promise<Buffer> {
  const cards = marketingHeroCardLayout(sources.length);
  const angles =
    sources.length === 4
      ? [-3, 2, -2, 3]
      : sources.length === 3
        ? [-3, 0, 3]
        : sources.length === 2
          ? [-2, 2]
          : [0];
  const productLayers = await Promise.all(
    sources.map(async (source, index) => {
      const card = cards[index]!;
      const prepared = await prepareCatalogProduct(source);
      const inset = prepared.cutout ? 4 : 20;
      const fitted = await sharp(prepared.bytes)
        .resize({
          width: card.width - inset * 2,
          height: card.height - inset * 2,
          fit: prepared.cutout ? "inside" : "contain",
          withoutEnlargement: false,
          background: prepared.cutout
            ? { r: 0, g: 0, b: 0, alpha: 0 }
            : "#ffffff",
        })
        .ensureAlpha()
        .png()
        .toBuffer();
      const rendered = await sharp(fitted)
        .rotate(angles[index] ?? 0, {
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer({ resolveWithObject: true });
      return {
        input: rendered.data,
        left: card.left + Math.round((card.width - rendered.info.width) / 2),
        top: card.top + Math.round((card.height - rendered.info.height) / 2),
      };
    }),
  );
  const composed = await sharp(backgroundSvg(style, cards))
    .composite(productLayers)
    .png()
    .toBuffer();
  return emailSafeJpeg(composed);
}

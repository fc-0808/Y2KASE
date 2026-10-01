/**
 * Composite perceptual fingerprint for product-photo duplicate detection.
 *
 * A single 64-bit dHash of the full studio frame is the wrong descriptor for
 * this catalogue: every phone-case hero shot shares the same silhouette on a
 * similar pastel sweep, so Hamming distances of 2–6 collide across genuinely
 * different designs (Rilakkuma vs an elephant charm at distance 2). idealo's
 * imagededup benchmarks and production dedup engines (DedupTool, PicLab)
 * converge on the same fix: **independent hashes must corroborate**, and the
 * hash is taken from the **product region**, not the whole frame.
 *
 * Each stored fingerprint is four 64-bit channels, computed on a centre crop:
 *
 *   1. horizontal dHash  — adjacent-pixel gradients (Krawetz / lookslikeit)
 *   2. vertical dHash    — the orthogonal gradient axis, so a shared outline
 *                          cannot carry the match on its own
 *   3. DCT pHash         — low-frequency structure of the artwork
 *                          (Hacker Factor / pHash.org)
 *   4. colour-layout     — 4×4 block mean RGB vs global mean, so two clear
 *                          shells with different prints don't collapse
 *
 * Comparison is still pure integer math. No model, no API call.
 */
import sharp from "sharp";
import { FINGERPRINT_PREFIX } from "@/lib/catalog/phash-types";

export { FINGERPRINT_PREFIX, isCurrentFingerprint } from "@/lib/catalog/phash-types";

const HASH_BITS = 64;
const HASH_HEX_LEN = HASH_BITS / 4; // 16
const FINGERPRINT_HEX_LEN = HASH_HEX_LEN * 4; // 64
const DCT_N = 32;
const DCT_KEEP = 8;
/** Keep the inner 66% so the case artwork dominates the pastel sweep. */
const CENTER_KEEP = 0.66;
const WORK_MIN = 16;

/** Bits set per hex nibble (0–15), for fast Hamming distance. */
const NIBBLE_BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/**
 * Precomputed DCT-II cosines: cos(π/N · (n + ½) · k) for n,k ∈ [0, N).
 * Hashing only needs a consistent linear transform, not an orthonormal one.
 */
const DCT_COS = (() => {
  const out = new Float64Array(DCT_N * DCT_N);
  for (let k = 0; k < DCT_N; k++) {
    for (let n = 0; n < DCT_N; n++) {
      out[k * DCT_N + n] = Math.cos((Math.PI / DCT_N) * (n + 0.5) * k);
    }
  }
  return out;
})();

export type Fingerprint = {
  version: 2;
  /** 16-char hex, horizontal difference hash. */
  dHashH: string;
  /** 16-char hex, vertical difference hash. */
  dHashV: string;
  /** 16-char hex, DCT perceptual hash. */
  pHash: string;
  /** 16-char hex, 4×4 colour-layout hash. */
  color: string;
  /** Wire form stored in `product_images.phash`. */
  raw: string;
};

/**
 * Per-channel Hamming cutoffs (out of 64). "Exact" is JPEG/WebP/resize of the
 * same photo. "Strong" is the candidate gate that still needs title/identity
 * corroboration before it can form a duplicate pair — dHash-only at this
 * radius is how the old matcher invented a 58-product cluster.
 */
export const HASH_LIMITS = {
  exact: { dHash: 2, pHash: 2, color: 4 },
  strong: { dHash: 4, pHash: 5, color: 8 },
} as const;

/**
 * @deprecated Kept so existing imports compile. The matcher no longer uses a
 * single Hamming cutoff; see {@link HASH_LIMITS} and `./duplicate-match`.
 */
export const DUPLICATE_THRESHOLD = HASH_LIMITS.strong.pHash;

/** Compute the v2 composite fingerprint of an image buffer. Null on decode failure. */
export async function fingerprintFromBuffer(
  buf: Buffer,
): Promise<string | null> {
  try {
    const cropped = await hashChannels(buf, true);
    if (cropped) return serializeFingerprint(cropped);
  } catch {
    // Centre-crop can disagree with EXIF rotation on a handful of files;
    // fall through and hash the full frame rather than dropping the photo.
  }
  try {
    const full = await hashChannels(buf, false);
    if (!full) return null;
    return serializeFingerprint(full);
  } catch {
    return null;
  }
}

/**
 * Legacy helper: horizontal dHash of a centre-cropped frame. Prefer
 * {@link fingerprintFromBuffer} for anything that participates in matching.
 */
export async function dhashFromBuffer(buf: Buffer): Promise<string | null> {
  const parsed = parseFingerprint((await fingerprintFromBuffer(buf)) ?? "");
  return parsed?.dHashH ?? null;
}

export function serializeFingerprint(fp: Omit<Fingerprint, "version" | "raw">): string {
  return `${FINGERPRINT_PREFIX}${fp.dHashH}${fp.dHashV}${fp.pHash}${fp.color}`;
}

export function parseFingerprint(raw: string | null | undefined): Fingerprint | null {
  if (!raw || !raw.startsWith(FINGERPRINT_PREFIX)) return null;
  const hex = raw.slice(FINGERPRINT_PREFIX.length);
  if (hex.length !== FINGERPRINT_HEX_LEN || /[^0-9a-f]/i.test(hex)) return null;
  const h = hex.toLowerCase();
  return {
    version: 2,
    dHashH: h.slice(0, 16),
    dHashV: h.slice(16, 32),
    pHash: h.slice(32, 48),
    color: h.slice(48, 64),
    raw: `${FINGERPRINT_PREFIX}${h}`,
  };
}

/**
 * Hamming distance between two hex strings (0 = identical, 4·len = opposite).
 * Mismatched/empty inputs return a max distance so they never count as a match.
 */
export function hammingDistance(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return HASH_BITS;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    dist += NIBBLE_BITS[x] ?? 4;
  }
  return dist;
}

export type VisualDistances = {
  dHashH: number;
  dHashV: number;
  /** max(H, V) — both gradient axes have to agree. */
  dHash: number;
  pHash: number;
  color: number;
  /**
   * Weighted cost used to rank pairs. pHash is the most discriminative
   * channel on this catalogue, so it is counted twice.
   */
  combined: number;
};

export function visualDistances(a: Fingerprint, b: Fingerprint): VisualDistances {
  const dHashH = hammingDistance(a.dHashH, b.dHashH);
  const dHashV = hammingDistance(a.dHashV, b.dHashV);
  const pHash = hammingDistance(a.pHash, b.pHash);
  const color = hammingDistance(a.color, b.color);
  const dHash = Math.max(dHashH, dHashV);
  return {
    dHashH,
    dHashV,
    dHash,
    pHash,
    color,
    combined: pHash * 2 + dHash + Math.round(color * 0.75),
  };
}

export type VisualKind = "exact" | "strong" | "none";

/** Classify a pair on visual evidence alone, with no identity/title gate. */
export function classifyVisual(dist: VisualDistances): VisualKind {
  if (
    dist.dHash <= HASH_LIMITS.exact.dHash &&
    dist.pHash <= HASH_LIMITS.exact.pHash &&
    dist.color <= HASH_LIMITS.exact.color
  ) {
    return "exact";
  }
  if (
    dist.dHash <= HASH_LIMITS.strong.dHash &&
    dist.pHash <= HASH_LIMITS.strong.pHash &&
    dist.color <= HASH_LIMITS.strong.color
  ) {
    return "strong";
  }
  return "none";
}

/** True only for visually exact fingerprints — never for a single-channel near miss. */
export function isNearDuplicate(a: string, b: string): boolean {
  const fa = parseFingerprint(a);
  const fb = parseFingerprint(b);
  if (!fa || !fb) return false;
  return classifyVisual(visualDistances(fa, fb)) === "exact";
}

// ── Image → four 64-bit channels ─────────────────────────────────────────────

async function hashChannels(
  buf: Buffer,
  crop: boolean,
): Promise<Omit<Fingerprint, "version" | "raw"> | null> {
  // metadata() on a Sharp instance can consume the pipeline; always re-open
  // from the buffer for the actual pixel work.
  const meta = await sharp(buf, { failOn: "none" }).rotate().metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 8 || height < 8) return null;

  const extract =
    crop && width >= WORK_MIN && height >= WORK_MIN
      ? centerCrop(width, height, CENTER_KEEP)
      : null;

  const source = extract
    ? sharp(buf, { failOn: "none" }).rotate().toColorspace("srgb").extract(extract)
    : sharp(buf, { failOn: "none" }).rotate().toColorspace("srgb");

  const [grey32, grey9x8, grey8x9, rgb8] = await Promise.all([
    source
      .clone()
      .greyscale()
      .resize(DCT_N, DCT_N, { fit: "fill" })
      .raw()
      .toBuffer(),
    source
      .clone()
      .greyscale()
      .resize(9, 8, { fit: "fill" })
      .raw()
      .toBuffer(),
    source
      .clone()
      .greyscale()
      .resize(8, 9, { fit: "fill" })
      .raw()
      .toBuffer(),
    source
      .clone()
      .resize(8, 8, { fit: "fill" })
      .removeAlpha()
      .toColorspace("srgb")
      .raw()
      .toBuffer(),
  ]);

  if (rgb8.byteLength < 8 * 8 * 3) return null;

  return {
    dHashH: dhashHorizontal(grey9x8, 9, 8),
    dHashV: dhashVertical(grey8x9, 8, 9),
    pHash: phashDct(grey32),
    color: colorLayoutHash(rgb8),
  };
}

function centerCrop(
  width: number,
  height: number,
  keep: number,
): { left: number; top: number; width: number; height: number } {
  const cw = Math.max(8, Math.round(width * keep));
  const ch = Math.max(8, Math.round(height * keep));
  return {
    left: Math.max(0, Math.floor((width - cw) / 2)),
    top: Math.max(0, Math.floor((height - ch) / 2)),
    width: Math.min(cw, width),
    height: Math.min(ch, height),
  };
}

function dhashHorizontal(pixels: Buffer, width: number, height: number): string {
  const bits: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width - 1; col++) {
      bits.push(pixels[row * width + col]! > pixels[row * width + col + 1]! ? 1 : 0);
    }
  }
  return bitsToHex(bits);
}

function dhashVertical(pixels: Buffer, width: number, height: number): string {
  const bits: number[] = [];
  for (let row = 0; row < height - 1; row++) {
    for (let col = 0; col < width; col++) {
      bits.push(pixels[row * width + col]! > pixels[(row + 1) * width + col]! ? 1 : 0);
    }
  }
  return bitsToHex(bits);
}

/**
 * DCT pHash: 32×32 greyscale → 2D DCT → 8×8 low-frequency block → bits vs
 * the mean of the 63 AC coefficients (Hacker Factor / pHash.org). Median
 * thresholding looks attractive but turns near-zero AC noise into random
 * bits on the low-texture studio shots this catalogue is made of.
 */
function phashDct(pixels: Buffer): string {
  const spatial = new Float64Array(DCT_N * DCT_N);
  for (let i = 0; i < spatial.length; i++) spatial[i] = pixels[i]!;
  const freq = dct2D(spatial);

  const coeffs: number[] = [];
  for (let y = 0; y < DCT_KEEP; y++) {
    for (let x = 0; x < DCT_KEEP; x++) {
      coeffs.push(freq[y * DCT_N + x]!);
    }
  }
  let acSum = 0;
  for (let i = 1; i < coeffs.length; i++) acSum += coeffs[i]!;
  const avg = acSum / (coeffs.length - 1);
  return bitsToHex(coeffs.map((c) => (c > avg ? 1 : 0)));
}

function dct2D(spatial: Float64Array): Float64Array {
  const n = DCT_N;
  const tmp = new Float64Array(n * n);
  const freq = new Float64Array(n * n);
  for (let y = 0; y < n; y++) {
    const row = y * n;
    for (let k = 0; k < n; k++) {
      let sum = 0;
      const cosRow = k * n;
      for (let x = 0; x < n; x++) sum += spatial[row + x]! * DCT_COS[cosRow + x]!;
      tmp[row + k] = sum;
    }
  }
  for (let x = 0; x < n; x++) {
    for (let k = 0; k < n; k++) {
      let sum = 0;
      const cosRow = k * n;
      for (let y = 0; y < n; y++) sum += tmp[y * n + x]! * DCT_COS[cosRow + y]!;
      freq[k * n + x] = sum;
    }
  }
  return freq;
}

/**
 * 8×8 RGB → 4×4 cells. Each cell contributes 4 bits (R/G/B/luma vs the
 * global mean), capturing where colour sits on the case rather than a
 * bag-of-hues histogram that two pastel shells would share.
 */
function colorLayoutHash(rgb: Buffer): string {
  const n = 8;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (let i = 0; i < n * n; i++) {
    sumR += rgb[i * 3]!;
    sumG += rgb[i * 3 + 1]!;
    sumB += rgb[i * 3 + 2]!;
  }
  const count = n * n;
  const meanR = sumR / count;
  const meanG = sumG / count;
  const meanB = sumB / count;
  const meanL = (meanR + meanG + meanB) / 3;

  const bits: number[] = [];
  for (let cy = 0; cy < 4; cy++) {
    for (let cx = 0; cx < 4; cx++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let oy = 0; oy < 2; oy++) {
        for (let ox = 0; ox < 2; ox++) {
          const i = ((cy * 2 + oy) * n + (cx * 2 + ox)) * 3;
          r += rgb[i]!;
          g += rgb[i + 1]!;
          b += rgb[i + 2]!;
        }
      }
      r /= 4;
      g /= 4;
      b /= 4;
      const l = (r + g + b) / 3;
      bits.push(r > meanR ? 1 : 0);
      bits.push(g > meanG ? 1 : 0);
      bits.push(b > meanB ? 1 : 0);
      bits.push(l > meanL ? 1 : 0);
    }
  }
  return bitsToHex(bits);
}

function bitsToHex(bits: number[]): string {
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    const nibble =
      ((bits[i] ?? 0) << 3) |
      ((bits[i + 1] ?? 0) << 2) |
      ((bits[i + 2] ?? 0) << 1) |
      (bits[i + 3] ?? 0);
    hex += nibble.toString(16);
  }
  return hex;
}

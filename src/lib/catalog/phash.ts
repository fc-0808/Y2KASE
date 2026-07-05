/**
 * Perceptual image hashing — the free, deterministic first line of duplicate
 * detection.
 *
 * We use **dHash** (difference hash): shrink the image to a tiny greyscale
 * grid and record, for each pixel, whether it is brighter than its right-hand
 * neighbour. The result is a 64-bit fingerprint that is robust to resizing,
 * re-compression (JPEG ↔ WebP), minor colour/brightness shifts and small
 * crops — exactly the transformations that turn "the same product photo" into
 * a byte-different file that a SHA-256 hash would miss.
 *
 * Two images are "near-duplicate" when the Hamming distance between their
 * hashes (the number of differing bits) is small. Comparison is pure integer
 * math — no model, no API call — so scanning the whole catalogue is cheap.
 */
import sharp from "sharp";

// 9×8 greyscale grid → 8 rows × 8 horizontal comparisons = 64 bits.
const GRID_W = 9;
const GRID_H = 8;
const HASH_BITS = (GRID_W - 1) * GRID_H; // 64

/** Bits set per hex nibble (0–15), for fast Hamming distance. */
const NIBBLE_BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/**
 * Compute the dHash of an image buffer as a 16-char hex string (64 bits).
 * Returns null if the image can't be decoded.
 */
export async function dhashFromBuffer(buf: Buffer): Promise<string | null> {
  try {
    const pixels = await sharp(buf)
      .greyscale()
      .resize(GRID_W, GRID_H, { fit: "fill" })
      .raw()
      .toBuffer();

    let bits = "";
    for (let row = 0; row < GRID_H; row++) {
      for (let col = 0; col < GRID_W - 1; col++) {
        const left = pixels[row * GRID_W + col];
        const right = pixels[row * GRID_W + col + 1];
        bits += left > right ? "1" : "0";
      }
    }

    let hex = "";
    for (let i = 0; i < HASH_BITS; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex;
  } catch {
    return null;
  }
}

/**
 * Hamming distance between two dHash hex strings (0 = identical, 64 = opposite).
 * Mismatched/empty inputs return a max distance so they never count as a match.
 */
export function hammingDistance(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return HASH_BITS;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    dist += NIBBLE_BITS[x] ?? 4;
  }
  return dist;
}

/**
 * Default near-duplicate threshold (out of 64 bits). ≤ this distance is treated
 * as "very likely the same image".
 *
 * Tuned empirically against the live catalogue (529 images): a generic dHash
 * cutoff of ~10 is too loose for product hero shots, where every phone case
 * shares the same silhouette on a similar background — that flags genuinely
 * different *designs* as duplicates. At ≤6 bits we get zero false positives
 * while still catching the same photo re-encoded or resized (those land at 0–6).
 */
export const DUPLICATE_THRESHOLD = 6;

/** Whether two hashes are within the near-duplicate threshold. */
export function isNearDuplicate(
  a: string,
  b: string,
  threshold: number = DUPLICATE_THRESHOLD,
): boolean {
  return hammingDistance(a, b) <= threshold;
}

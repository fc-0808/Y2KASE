/**
 * Image-generation policy that can be unit-tested without calling OpenAI.
 *
 * Fashion stills must attach a real catalog photo. Text-only generation
 * invents SKUs (a flat Miffy print that is not in the shop) and plastic faces.
 */

/** gpt-image-1 edit accepts up to 16 refs; three catalog angles is enough. */
export const MAX_PRODUCT_REFERENCE_IMAGES = 3;

/**
 * `input_fidelity: high` is supported on gpt-image-1 / 1.5 / 2, not mini,
 * not DALL·E. High fidelity is what keeps a 3D charm from becoming a drawing.
 */
export function supportsInputFidelity(model: string): boolean {
  const m = model.trim().toLowerCase();
  if (!m || m.includes("mini") || m.startsWith("dall-e")) return false;
  return (
    m.startsWith("gpt-image-1") ||
    m.startsWith("gpt-image-2") ||
    m.startsWith("chatgpt-image")
  );
}

/** First N public catalog URLs, de-duplicated. Relative / empty values drop. */
export function catalogReferenceUrls(
  urls: readonly (string | null | undefined)[],
  max = MAX_PRODUCT_REFERENCE_IMAGES,
): string[] {
  const cap = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : 0;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const url = typeof raw === "string" ? raw.trim() : "";
    if (!url) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= cap) break;
  }
  return out;
}

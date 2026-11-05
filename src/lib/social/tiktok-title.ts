/**
 * TikTok post title.
 *
 * In 2026, US shoppers for this kind of case search inside TikTok, and the
 * sale usually stays in the app. TikTok matches that search against the
 * start of the post title and cuts the rest off on a phone. The catalog
 * title spends those characters listing every iPhone generation.
 *
 * The title therefore opens with the same shopping phrase used for a
 * specific model — character, then iPhone 18 Pro — and only then a short
 * caption, inside TikTok's 150-character field.
 */
import { shoppingTitle } from "@/lib/catalog/shopping-title";

export const TIKTOK_TITLE_MAX = 150;

export function buildTikTokPostTitle(input: {
  productTitle?: string | null;
  caption?: string | null;
}): string {
  const catalog = input.productTitle?.replace(/\s+/g, " ").trim() ?? "";
  const search = catalog
    ? shoppingTitle({
        title: catalog,
        productType: inferProductType(catalog),
      })
    : "";
  const caption = cleanCaption(input.caption, search);
  const joined = [search || catalog, caption].filter(Boolean).join(" · ");
  return clip(joined || "Y2KASE", TIKTOK_TITLE_MAX);
}

function inferProductType(title: string): string {
  if (/\bairpods\b/i.test(title)) return "airpod_case";
  if (/\bduo\b/i.test(title)) return "iphone_duo_case";
  if (/\bgalaxy\b/i.test(title)) return "samsung_case";
  if (/\bgrip\b/i.test(title) && !/\bcase\b/i.test(title)) return "magnetic_grip";
  return "iphone_case";
}

/** Drop a caption that only repeats the catalog title or the search phrase. */
function cleanCaption(caption: string | null | undefined, search: string): string {
  const text = caption?.replace(/\s+/g, " ").trim() ?? "";
  if (!text) return "";
  const folded = text.toLowerCase();
  if (search && folded.startsWith(search.toLowerCase())) return "";
  if (/\bfor iphone\s+\d{2}(\s+\d{2}){2,}/i.test(text)) return "";
  return text;
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > 40 ? cut.slice(0, space) : cut).trim();
}

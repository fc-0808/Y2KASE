/**
 * Look-rail decisions — one design per tap, shared by the browse rail and the
 * catalog heading.
 *
 * Pure on purpose. The rail is a client island; this module must not import
 * the collection taxonomy (that seed is large, and only the server needs it
 * when it builds the character list). Themes and colors are closed lists the
 * filter sheet already ships to the client.
 */

export const LOOK_CHARACTER_LIMIT = 18;

export type LookSegmentId = "characters" | "themes" | "colors";

export type LookBrand = {
  slug: string;
  name: string;
  icon: string | null;
  accentColor: string | null;
  children?: readonly LookBrand[];
};

export type LookCharacter = {
  slug: string;
  name: string;
  icon: string | null;
  accentColor: string | null;
  count: number;
};

/**
 * A tap on the rail commits one look inside that facet.
 *
 * The same slug, already alone, clears. Any other tap replaces the facet, so
 * pink and Hello Kitty can stack (they live on different facets) while two
 * characters cannot. Combining several characters stays in the filter sheet.
 */
export function nextLookSelection(
  selected: readonly string[],
  slug: string,
): string[] {
  if (selected.length === 1 && selected[0] === slug) return [];
  return [slug];
}

/**
 * Shop order, or A–Z by the label the shopper reads.
 *
 * Shop order is the list the caller already merchandised. A–Z copies it, so
 * the pinned Sanrio run is untouched until someone asks for the alphabet.
 */
export function orderByLabel<T>(
  items: readonly T[],
  label: (item: T) => string,
  alphabetical: boolean,
): T[] {
  if (!alphabetical) return items as T[];
  return items.slice().sort((a, b) =>
    label(a).localeCompare(label(b), "en", { sensitivity: "base" }),
  );
}

/** Keep a closed family list in its merchandised order, dropping empty rows. */
export function stockedFamilies<T extends { slug: string }>(
  families: readonly T[],
  counts: Readonly<Record<string, number>>,
  selected: readonly string[],
): T[] {
  const picked = new Set(selected);
  return families.filter(
    (family) => (counts[family.slug] ?? 0) > 0 || picked.has(family.slug),
  );
}

/**
 * Which segment is showing.
 *
 * An explicit pick wins, including across a navigation that changes counts.
 * Otherwise open the segment the URL already narrowed, then the first one
 * that has anything to show.
 */
export function activeLookSegment(
  segments: readonly LookSegmentId[],
  picked: LookSegmentId | null,
  selected: { brands: number; motifs: number; colors: number },
): LookSegmentId | null {
  if (segments.length === 0) return null;
  if (picked && segments.includes(picked)) return picked;
  if (selected.brands > 0 && segments.includes("characters")) return "characters";
  if (selected.motifs > 0 && segments.includes("themes")) return "themes";
  if (selected.colors > 0 && segments.includes("colors")) return "colors";
  return segments[0] ?? null;
}

export function lookSegments(input: {
  characters: number;
  themes: number;
  colors: number;
}): LookSegmentId[] {
  const segments: LookSegmentId[] = [];
  if (input.characters > 0) segments.push("characters");
  if (input.themes > 0) segments.push("themes");
  if (input.colors > 0) segments.push("colors");
  return segments;
}

/**
 * The page heading is worth showing when one design facet is the whole view.
 *
 * Shop All stays untitled — the cases are the heading. A second facet (pink
 * Hello Kitty, or Hello Kitty on a device) makes a single title a lie, so
 * that view stays quiet too and the chips carry the state.
 */
export function isSoloDesignView(params: {
  brands: readonly string[];
  colors: readonly string[];
  motifs: readonly string[];
  device?: string;
  collection?: string;
  magsafe?: boolean;
  tag?: string;
  q?: string;
}): boolean {
  const marks = params.brands.length + params.colors.length + params.motifs.length;
  if (marks !== 1) return false;
  return (
    params.device === undefined &&
    params.collection === undefined &&
    params.magsafe === undefined &&
    !params.tag &&
    !params.q
  );
}

/**
 * Horizontal scroll offset that centers `item` in the rail, or null when it
 * is already fully visible. Never touches the page scroll.
 */
export function railScrollLeft(args: {
  scrollLeft: number;
  clientWidth: number;
  itemLeft: number;
  itemWidth: number;
}): number | null {
  const itemRight = args.itemLeft + args.itemWidth;
  const viewRight = args.scrollLeft + args.clientWidth;
  if (args.itemLeft >= args.scrollLeft && itemRight <= viewRight + 1) return null;
  const target = args.itemLeft - (args.clientWidth - args.itemWidth) / 2;
  return Math.max(0, Math.round(target));
}

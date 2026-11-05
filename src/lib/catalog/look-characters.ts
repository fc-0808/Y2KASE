/**
 * Which characters the look rail offers.
 *
 * Server-only in spirit: importing this pulls the collection taxonomy seed,
 * which does not belong in the catalog client bundle. Pages call it while
 * they already have brand facets and counts, and pass the short result down.
 */

import {
  COLLECTION_TAXONOMY,
  isSameShopAsParent,
  orderRailCategories,
  ORIGINALS_SLUG,
  RAIL_HIDDEN_SLUGS,
} from "./collections-config";
import {
  LOOK_CHARACTER_LIMIT,
  type LookBrand,
  type LookCharacter,
} from "./look-rail";

/**
 * Stocked characters, in the same order as every other character row:
 * Sanrio and its crew first (Kuromi with Hello Kitty, not by case count),
 * then other licensed shops, then Originals — designs with no character.
 *
 * A character whose shelf is the entire parent shop is omitted — Crayon
 * Shin-chan and Shin-chan would be the same tile twice. A selected slug is
 * kept even when that rule, a zero count, or the cap would have dropped it,
 * so a shared URL can still be turned off from the rail.
 */
export function lookCharacters(
  brands: readonly LookBrand[],
  counts: Readonly<Record<string, number>>,
  selected: readonly string[],
  limit = LOOK_CHARACTER_LIMIT,
): LookCharacter[] {
  const picked = new Set(selected);
  const tiles: LookCharacter[] = [];
  const seen = new Set<string>();

  const add = (brand: LookBrand, count: number) => {
    if (seen.has(brand.slug)) return;
    const on = picked.has(brand.slug);
    if (RAIL_HIDDEN_SLUGS.has(brand.slug) && !on) return;
    if (count <= 0 && !on) return;
    seen.add(brand.slug);
    tiles.push({
      slug: brand.slug,
      name: brand.name,
      icon: brand.icon,
      accentColor: brand.accentColor,
      count,
    });
  };

  for (const brand of brands) {
    const parentCount = counts[brand.slug] ?? 0;
    const children = brand.children ?? [];
    if (children.length === 0) {
      add(brand, parentCount);
      continue;
    }
    add(brand, parentCount);
    for (const child of children) {
      const childCount = counts[child.slug] ?? 0;
      if (isSameShopAsParent(childCount, parentCount) && !picked.has(child.slug)) {
        continue;
      }
      add(child, childCount);
    }
  }

  const originalsCount = counts[ORIGINALS_SLUG] ?? 0;
  if (
    !seen.has(ORIGINALS_SLUG) &&
    (originalsCount > 0 || picked.has(ORIGINALS_SLUG))
  ) {
    const seed = COLLECTION_TAXONOMY.find((node) => node.slug === ORIGINALS_SLUG);
    tiles.push({
      slug: ORIGINALS_SLUG,
      name: seed?.name ?? "Originals",
      icon: seed?.icon ?? null,
      accentColor: seed?.accentColor ?? null,
      count: originalsCount,
    });
  }

  tiles.sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
  const ordered = orderRailCategories(tiles, Math.max(0, limit));
  const kept = new Set(ordered.map((tile) => tile.slug));
  const rescued = tiles.filter(
    (tile) => picked.has(tile.slug) && !kept.has(tile.slug),
  );
  return [...rescued, ...ordered];
}

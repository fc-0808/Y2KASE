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

/**
 * A collection the character rail can treat as the page the shopper is on.
 *
 * A nested character (Kuromi under Sanrio) lists its stocked siblings, with
 * this page pressed. A brand lists every stocked character shop. Miffy is
 * that shop. Sanrio and Rilakkuma also stay in the row — they have their own
 * characters, and the brand page is still that brand. The same rail is used
 * on the brand's iPhone 18 sub-route. Genres and features are not brands.
 */
export type CharacterLandingNode = {
  slug: string;
  name: string;
  kind: string;
  icon: string | null;
  accentColor: string | null;
  totalCount: number;
  children: CharacterLandingNode[];
};

export type CharacterLandingRail = {
  tiles: LookBrand[];
  counts: Record<string, number>;
};

export function characterLandingRail(
  tree: readonly CharacterLandingNode[],
  slug: string,
): CharacterLandingRail | null {
  const node = findLandingNode(tree, slug);
  if (!node) return null;
  if (node.kind === "character") {
    const parent = findLandingParent(tree, slug);
    const siblings = (parent?.children ?? []).filter(
      (child) =>
        child.kind === "character" &&
        (child.totalCount > 0 || child.slug === slug),
    );
    return siblings.length > 0 ? toLandingRail(siblings) : null;
  }
  if (node.kind !== "brand") return null;
  const listed = browseCharacterShops(tree, slug);
  const shops = listed.some((entry) => entry.slug === slug)
    ? listed
    : [node, ...listed];
  if (!shops.some((entry) => entry.slug === slug)) return null;
  return toLandingRail(shops);
}

/** Where a pressed character tile sends the shopper when this page is cleared. */
export function characterLandingClearPath(
  tree: readonly CharacterLandingNode[],
  slug: string,
): string {
  const node = findLandingNode(tree, slug);
  if (node?.kind === "character") {
    const parent = findLandingParent(tree, slug);
    if (parent) return `/collections/${parent.slug}`;
  }
  return "/collections";
}

function browseCharacterShops(
  tree: readonly CharacterLandingNode[],
  current: string,
): CharacterLandingNode[] {
  const listed: CharacterLandingNode[] = [];
  for (const node of tree) {
    if (node.kind !== "brand" && node.kind !== "character") continue;
    const characters = node.children.filter(
      (child) =>
        child.kind === "character" &&
        (child.totalCount > 0 || child.slug === current),
    );
    const shops = characters.length > 0 ? characters : [node];
    for (const shop of shops) {
      if (shop.totalCount > 0 || shop.slug === current) listed.push(shop);
    }
  }
  return listed;
}

function toLandingRail(nodes: readonly CharacterLandingNode[]): CharacterLandingRail {
  const tiles: LookBrand[] = [];
  const counts: Record<string, number> = {};
  for (const node of nodes) {
    if (counts[node.slug] !== undefined) continue;
    tiles.push({
      slug: node.slug,
      name: node.name,
      icon: node.icon,
      accentColor: node.accentColor,
    });
    counts[node.slug] = node.totalCount;
  }
  return { tiles, counts };
}

function findLandingNode(
  nodes: readonly CharacterLandingNode[],
  slug: string,
): CharacterLandingNode | null {
  for (const node of nodes) {
    if (node.slug === slug) return node;
    const hit = findLandingNode(node.children, slug);
    if (hit) return hit;
  }
  return null;
}

function findLandingParent(
  nodes: readonly CharacterLandingNode[],
  slug: string,
  parent: CharacterLandingNode | null = null,
): CharacterLandingNode | null {
  for (const node of nodes) {
    if (node.slug === slug) return parent;
    const found = findLandingParent(node.children, slug, node);
    if (found) return found;
  }
  return null;
}

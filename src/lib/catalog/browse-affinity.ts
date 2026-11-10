/**
 * Session affinity for the "You may also like" rail.
 *
 * The server list stays the crawlable default: same collection, then the same
 * device. After hydration the browser may lead that row with another character
 * this visitor has actually been opening. One or two earlier views leave the
 * row alone. Three or more views of one character, on a page for a different
 * character, pull that character forward. The product on the page and the
 * cases already sitting in Recently viewed stay out of the row.
 *
 * Pure on purpose. Storage, the network, and the mould split (iPhone versus
 * iPhone Duo) live with their callers, so this rule can be tested without a
 * database or a browser.
 */

export const RELATED_RAIL_LIMIT = 8;
/** Below this, a row looks broken, so a few already-opened cases may return. */
export const RELATED_RAIL_MIN = 4;
/** Views of one character required before it leads a different character's page. */
export const AFFINITY_MIN_VIEWS = 3;
/** Cards kept from the page the shopper is on, after the affinity lead. */
export const AFFINITY_ANCHOR_COUNT = 2;
/**
 * A quiet half hour starts a new visit. Older opens still show in Recently
 * viewed, and they stay off this row, but they no longer choose its character.
 */
export const AFFINITY_SESSION_MS = 30 * 60 * 1000;

const SHOP_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Collection slugs only. Rejects paths, spaces, and anything a query could widen. */
export function isShopSlug(value: string): boolean {
  return value.length > 0 && value.length <= 80 && SHOP_SLUG.test(value);
}

/**
 * The one shop this product belongs to for affinity.
 * A character face wins over its parent brand. Genre and feature shelves
 * (kawaii, MagSafe) are not a character someone is browsing.
 */
export function shopCharacter(
  links: readonly { slug: string; kind: string; name?: string }[],
  title?: string,
): string | null {
  const characters = links.filter(
    (link) => link.kind === "character" && isShopSlug(link.slug),
  );
  const named = title ? characterNamedInTitle(characters, title) : null;
  if (named) return named;
  if (characters[0]) return characters[0].slug;
  const brand = links.find(
    (link) => link.kind === "brand" && isShopSlug(link.slug),
  );
  return brand?.slug ?? null;
}

/**
 * One character named in the title is the face on the case. Two names, or
 * none, leave the caller with the collection order it already sorted.
 */
function characterNamedInTitle(
  links: readonly { slug: string; name?: string }[],
  title: string,
): string | null {
  const hits = links.filter((link) => {
    const name = link.name?.trim();
    if (name && mentions(title, name)) return true;
    return mentions(title, link.slug.replace(/-/g, " "));
  });
  return hits.length === 1 ? hits[0].slug : null;
}

function mentions(title: string, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (needle.length < 3) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(title);
}

export type BrowseSignal = {
  id: number;
  characterSlug?: string | null;
  /** Epoch milliseconds. Missing on visits stored before sessions existed. */
  seenAt?: number;
};

/**
 * The character that should lead the rail, or null when history is too thin
 * or the shopper is already on that character's page.
 *
 * History is newest first. A tie keeps the character opened most recently.
 * The product on the page does not count as one of the three views.
 * Counting stops at the first half-hour gap, and at any visit with no time,
 * so last month's browsing cannot pick today's row.
 */
export function leadingCharacter(
  history: readonly BrowseSignal[],
  current: BrowseSignal,
  now = Date.now(),
): string | null {
  const counts = new Map<string, number>();
  let bestSlug: string | null = null;
  let bestCount = 0;
  let previous = now;

  for (const item of history) {
    if (typeof item.seenAt !== "number" || previous - item.seenAt > AFFINITY_SESSION_MS) {
      break;
    }
    previous = item.seenAt;
    if (item.id === current.id) continue;
    const slug = item.characterSlug;
    if (!slug || !isShopSlug(slug)) continue;
    const count = (counts.get(slug) ?? 0) + 1;
    counts.set(slug, count);
    if (count > bestCount) {
      bestSlug = slug;
      bestCount = count;
    }
  }

  if (!bestSlug || bestCount < AFFINITY_MIN_VIEWS) return null;
  if (bestSlug === current.characterSlug) return null;
  return bestSlug;
}

type ComposeOptions = {
  currentId: number;
  recentIds: ReadonlySet<number>;
  limit?: number;
  anchor?: number;
};

/**
 * Lead with `affinity`, then keep a couple of `siblings` from the page the
 * shopper is on, then fill the row. With no affinity pool and nothing to
 * exclude, the server list is returned untouched.
 */
export function composeRelated<T extends { id: number }>(
  siblings: readonly T[],
  affinity: readonly T[],
  options: ComposeOptions,
): T[] {
  const limit = options.limit ?? RELATED_RAIL_LIMIT;
  const anchor = options.anchor ?? AFFINITY_ANCHOR_COUNT;
  if (affinity.length === 0 && options.recentIds.size === 0) {
    return siblings.slice(0, limit);
  }

  const blocked = new Set(options.recentIds);
  blocked.add(options.currentId);
  const used = new Set<number>();

  const take = (items: readonly T[], max: number): T[] => {
    const picked: T[] = [];
    for (const item of items) {
      if (picked.length >= max) break;
      if (blocked.has(item.id) || used.has(item.id)) continue;
      used.add(item.id);
      picked.push(item);
    }
    return picked;
  };

  const hasAffinity = affinity.length > 0;
  const lead = take(affinity, hasAffinity ? Math.max(0, limit - anchor) : 0);
  const anchors = take(siblings, hasAffinity ? anchor : limit);
  const fill = [...take(affinity, limit), ...take(siblings, limit)];
  const result = [...lead, ...anchors, ...fill].slice(0, limit);

  if (result.length >= RELATED_RAIL_MIN) return result;

  for (const item of siblings) {
    if (result.length >= RELATED_RAIL_MIN) break;
    if (item.id === options.currentId || used.has(item.id)) continue;
    used.add(item.id);
    result.push(item);
  }
  return result;
}

export function sameProductIds(
  left: readonly { id: number }[],
  right: readonly { id: number }[],
): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => item.id === right[index]?.id)
  );
}

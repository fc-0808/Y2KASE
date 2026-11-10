/**
 * Recently viewed products, stored only in this browser.
 *
 * The card fields render the recall row. `characterSlug` and `productType`
 * are what the "You may also like" rail reads to tell which character this
 * visit has been shopping, and for which device. Older entries without those
 * fields still render; they just don't count toward affinity.
 */

import { isShopSlug } from "@/lib/catalog/browse-affinity";

const STORAGE_KEY = "y2k_recently_viewed";
const PRODUCT_TYPE = /^[a-z0-9_]+$/;

export const RECENTLY_VIEWED_MAX = 12;

export type RecentProduct = {
  id: number;
  slug: string;
  title: string;
  price: string;
  compareAtPrice: string | null;
  currency: string;
  imageUrl: string | null;
  productType?: string;
  characterSlug?: string;
  /** Epoch milliseconds for the visit that put this card at the front. */
  seenAt?: number;
};

export function parseRecentProducts(raw: string): RecentProduct[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const items: RecentProduct[] = [];
    for (const entry of parsed) {
      const item = sanitizeRecentProduct(entry);
      if (!item) continue;
      items.push(item);
      if (items.length >= RECENTLY_VIEWED_MAX) break;
    }
    return items;
  } catch {
    return [];
  }
}

export function readRecentProducts(): RecentProduct[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseRecentProducts(raw) : [];
  } catch {
    return [];
  }
}

/** Writes `current` to the front and returns the earlier visits, newest first. */
export function rememberRecentProduct(current: RecentProduct): RecentProduct[] {
  const stored = toStored(current);
  const previous = readRecentProducts().filter(
    (item) => item.id !== stored.id && item.slug !== stored.slug,
  );
  const next = [stored, ...previous].slice(0, RECENTLY_VIEWED_MAX);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode and quota errors still leave this page's rail intact.
  }
  return previous;
}

function toStored(item: RecentProduct): RecentProduct {
  const productType =
    item.productType && PRODUCT_TYPE.test(item.productType)
      ? item.productType
      : undefined;
  const characterSlug =
    item.characterSlug && isShopSlug(item.characterSlug)
      ? item.characterSlug
      : undefined;
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    price: item.price,
    compareAtPrice: item.compareAtPrice,
    currency: item.currency,
    imageUrl: item.imageUrl,
    seenAt: typeof item.seenAt === "number" ? item.seenAt : Date.now(),
    ...(productType ? { productType } : {}),
    ...(characterSlug ? { characterSlug } : {}),
  };
}

function sanitizeRecentProduct(entry: unknown): RecentProduct | null {
  if (!entry || typeof entry !== "object") return null;
  const row = entry as Record<string, unknown>;
  if (typeof row.id !== "number" || !Number.isInteger(row.id) || row.id <= 0) {
    return null;
  }
  if (typeof row.slug !== "string" || row.slug.length === 0 || row.slug.length > 200) {
    return null;
  }
  if (typeof row.title !== "string" || row.title.length === 0) return null;
  if (typeof row.price !== "string") return null;
  if (typeof row.currency !== "string" || row.currency.length === 0) return null;
  if (row.compareAtPrice !== null && typeof row.compareAtPrice !== "string") {
    return null;
  }
  if (row.imageUrl !== null && typeof row.imageUrl !== "string") return null;

  const productType =
    typeof row.productType === "string" && PRODUCT_TYPE.test(row.productType)
      ? row.productType
      : undefined;
  const characterSlug =
    typeof row.characterSlug === "string" && isShopSlug(row.characterSlug)
      ? row.characterSlug
      : undefined;
  const seenAt = seenAtOf(row.seenAt);

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    price: row.price,
    compareAtPrice: row.compareAtPrice,
    currency: row.currency,
    imageUrl: row.imageUrl,
    ...(seenAt ? { seenAt } : {}),
    ...(productType ? { productType } : {}),
    ...(characterSlug ? { characterSlug } : {}),
  };
}

function seenAtOf(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < 1_700_000_000_000) return undefined;
  return value;
}

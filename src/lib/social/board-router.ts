/**
 * Social Studio — Pinterest board routing.
 *
 * Sends each listing to the most topically-relevant board (e.g. a Hello Kitty
 * case → the "hello kitty" board, a Sanrio item → "sanrio") instead of dumping
 * everything on one catch-all board. Pinterest's algorithm rewards topical
 * coherence, so board routing meaningfully improves distribution.
 *
 * Matching is derived from the product's collections (the storefront's
 * marketing taxonomy): the product's collection names/slugs are compared to the
 * account's board names, most-specific collection first (character → brand →
 * genre → feature). Anything that doesn't match a dedicated board falls back to
 * the default board (PINTEREST_AUTOPIN_BOARD_ID / the account's first board).
 */

import { sql } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import type { PinterestBoard } from "@/lib/social/pinterest";

export type ResolvedBoard = { id: string; name: string | null };

/** Collapse a label to a comparable key: lowercase alphanumerics only. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Two keys "match" when one contains the other (with a min-length guard). */
function keysMatch(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return a === b;
  return a.includes(b) || b.includes(a);
}

type CollectionKey = { name: string; slug: string; kind: string };

/** A product's collections, ordered most-specific first. */
async function getProductCollections(
  productId: number,
): Promise<CollectionKey[]> {
  if (!isDbConfigured()) return [];
  const res = await db.execute<{ name: string; slug: string; kind: string }>(sql`
    SELECT c.name, c.slug, c.kind
    FROM product_collections pc
    JOIN collections c ON c.id = pc.collection_id
    WHERE pc.product_id = ${productId} AND c.status = 'active'
    ORDER BY
      (CASE c.kind
        WHEN 'character' THEN 0
        WHEN 'brand' THEN 1
        WHEN 'genre' THEN 2
        ELSE 3 END) ASC,
      pc.position ASC
  `);
  const rows = (Array.isArray(res) ? res : res.rows) as CollectionKey[];
  return rows ?? [];
}

/**
 * Resolve the best board id for a product. Prefers a dedicated topic board that
 * matches one of the product's collections (most specific first); otherwise
 * returns the default board.
 *
 * `boards` is passed in so the caller can fetch the board list once per run.
 */
export async function resolveBoardForProduct(
  productId: number,
  boards: PinterestBoard[],
  defaultBoardId: string,
): Promise<ResolvedBoard> {
  const fallback: ResolvedBoard = {
    id: defaultBoardId,
    name: boards.find((b) => b.id === defaultBoardId)?.name ?? null,
  };

  if (boards.length === 0) return fallback;

  // Precompute normalized board keys; skip the catch-all "social" board so it
  // never wins a specific match (it's the fallback).
  const boardKeys = boards
    .filter((b) => norm(b.name) !== "social")
    .map((b) => ({ board: b, key: norm(b.name) }));

  const collections = await getProductCollections(productId);
  for (const col of collections) {
    const candidates = [norm(col.name), norm(col.slug)].filter(Boolean);
    for (const bk of boardKeys) {
      if (candidates.some((c) => keysMatch(bk.key, c))) {
        return { id: bk.board.id, name: bk.board.name };
      }
    }
  }

  return fallback;
}

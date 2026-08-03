/**
 * The runtime half of the brand vocabulary.
 *
 * A brand IS a browse node. Storing the classification vocabulary anywhere else
 * would recreate the exact defect this catalogue already shipped once: nine
 * brands — Disney, Toy Story, Monchhichi, Crayon Shin-chan among them — were
 * classifiable but had no collection behind them, so filing linked their
 * products to nothing and they fell out of the browse tree entirely. Deriving
 * the registry from `collections` makes that failure structurally impossible: a
 * brand you can name is a brand you can browse, because they are one row.
 *
 * Reading is cached and tagged rather than per-request, because the vocabulary
 * changes a handful of times a year and is read on nearly every admin render.
 * Writes go through `./brand-admin`, which invalidates the tag.
 */
import { cache as reactCache } from "react";
import { unstable_cache } from "next/cache";
import { db, isDbConfigured } from "@/lib/db";
import { CACHE_TAGS } from "@/lib/cache";
import {
  installBrandRegistry,
  type BrandKnowledge,
  type CharacterKnowledge,
} from "@/lib/catalog/brands";
import { BRAND_COLLECTION_KINDS } from "@/lib/catalog/collections-config";

type VocabularyRow = {
  id: number;
  slug: string;
  name: string;
  kind: string;
  parentId: number | null;
  aliases: string[];
};

/**
 * Every brand/character browse node, shaped as registry entries.
 *
 * Genre and feature nodes are excluded: "Kawaii" is a shelf, not an IP, and
 * letting it classify would put every cute case under a brand that has no
 * rights holder.
 */
async function computeBrandVocabulary(): Promise<BrandKnowledge[]> {
  if (!isDbConfigured()) return [];

  const rows = (await db.query.collections.findMany({
    columns: {
      id: true,
      slug: true,
      name: true,
      kind: true,
      parentId: true,
      aliases: true,
    },
  })) as VocabularyRow[];

  const usable = rows.filter((row) => BRAND_COLLECTION_KINDS.has(row.kind));
  const byId = new Map(usable.map((row) => [row.id, row]));

  // A character node's parent is its brand. A character whose parent is missing
  // or is itself a character cannot be placed, and is skipped rather than
  // guessed at — an unplaceable character would resolve to the wrong house.
  const charactersByBrandSlug = new Map<string, CharacterKnowledge[]>();
  for (const row of usable) {
    if (row.kind !== "character" || row.parentId === null) continue;
    const parent = byId.get(row.parentId);
    if (!parent || parent.kind !== "brand") continue;
    const list = charactersByBrandSlug.get(parent.slug) ?? [];
    list.push({ id: row.slug, name: row.name, aliases: row.aliases });
    charactersByBrandSlug.set(parent.slug, list);
  }

  return usable
    .filter((row) => row.kind === "brand")
    .map((row) => ({
      id: row.slug,
      brand: row.name,
      aliases: row.aliases,
      characters: charactersByBrandSlug.get(row.slug) ?? [],
    }));
}

const getBrandVocabularyCached = unstable_cache(
  computeBrandVocabulary,
  ["brand-vocabulary"],
  { tags: [CACHE_TAGS.collections], revalidate: 3600 },
);

/** The runtime vocabulary, memoized per request on top of the Data Cache. */
export const getBrandVocabulary = reactCache(
  async (): Promise<BrandKnowledge[]> => {
    try {
      return await getBrandVocabularyCached();
    } catch {
      // A vocabulary we cannot read is not a reason to fail a page: the canon
      // in `brands.ts` is a complete, working registry on its own. Degrading to
      // it loses runtime-defined brands and nothing else.
      return [];
    }
  },
);

/**
 * Load the runtime vocabulary and make it the active registry for this request.
 *
 * Call this at the top of any server path that classifies, files or composes a
 * title. Forgetting to is safe rather than silently wrong: the registry falls
 * back to the built-in canon, which is exactly the behaviour that shipped
 * before operator-defined brands existed.
 */
export async function ensureBrandRegistry(): Promise<void> {
  installBrandRegistry(await getBrandVocabulary());
}

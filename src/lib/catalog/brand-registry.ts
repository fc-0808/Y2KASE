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
 * The read is memoized for the current request only. A longer cache is wrong
 * here: creating Usahana and assigning it are two requests, and a stale
 * snapshot makes the second one reject a brand that was just saved.
 * Writes go through `./brand-admin`.
 */
import { cache as reactCache } from "react";
import { db, isDbConfigured } from "@/lib/db";
import {
  compileBrandRegistry,
  installBrandRegistry,
  resolveBrandAssignment,
  type BrandKnowledge,
  type BrandResolution,
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

/**
 * The runtime vocabulary, memoized for this request.
 *
 * Not the Data Cache. That cache is allowed to answer a shopper with the
 * previous snapshot while it refreshes; an operator who just added a brand
 * cannot be told the name is unknown because of that snapshot. A failed read
 * returns null so the caller can leave the current registry in place —
 * installing an empty list would wipe it back to the built-in canon.
 */
export const getBrandVocabulary = reactCache(
  async (): Promise<BrandKnowledge[] | null> => {
    if (!isDbConfigured()) return null;
    try {
      return await computeBrandVocabulary();
    } catch (error) {
      console.error("[brand-registry] collections read failed", error);
      return null;
    }
  },
);

/**
 * Load the runtime vocabulary and publish it to every copy of the registry.
 *
 * Call this before resolving a brand the operator picked. The in-memory
 * registry starts as the built-in canon, so a brand that exists only in
 * `collections` — Usahana, for example — is rejected until this runs. A failed
 * read does not install: an empty install is how a transient database error
 * used to erase every operator-created brand for the rest of the process.
 */
export async function ensureBrandRegistry(): Promise<void> {
  const vocabulary = await getBrandVocabulary();
  if (vocabulary) installBrandRegistry(vocabulary);
}

/**
 * Resolve a brand the operator chose, against the collections table.
 *
 * The page that lists brands and the action that saves one do not share a
 * module-level registry. Loading and then calling `resolveBrandAssignment()`
 * can still miss Usahana, because the load updates a different copy of the
 * list than the resolve reads. This compiles the rows it just read and passes
 * that object in, so the decision is the database row.
 */
export async function resolveSavedBrand(
  brandInput: string | null | undefined,
  characterInput?: string | null,
): Promise<BrandResolution> {
  if (!isDbConfigured()) {
    return {
      ok: false,
      reason: "The database is not configured, so saved brands cannot be read.",
    };
  }

  let vocabulary: BrandKnowledge[];
  try {
    vocabulary = await computeBrandVocabulary();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reason: `The brand list could not be read (${detail}).`,
    };
  }

  const registry = compileBrandRegistry(vocabulary);
  installBrandRegistry(vocabulary);
  return resolveBrandAssignment(brandInput, characterInput, registry);
}

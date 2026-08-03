/**
 * Reconcile the `collections` table with the config taxonomy.
 *
 * The browse tree is config-as-code (`collections-config.ts`) but the admin
 * pickers, filters and membership rows all read the *table*. Until the config is
 * pushed, a newly added node simply doesn't exist as far as the app is
 * concerned — which is exactly how "Rilakkuma" ended up absent from the brand
 * dropdown while sitting right there in source control.
 *
 * Rather than leave that to a remembered terminal command, the reconciliation
 * lives here and has two entry points: `npm run seed:collections` for CI/CLI,
 * and a one-click sync in the products console for operators. Both call the same
 * function, so they can't diverge.
 *
 * Membership in `product_collections` is never touched.
 */
import { eq, inArray } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { collections } from "@/lib/db/schema";
import {
  flattenTaxonomy,
  type FlatCollectionSeed,
} from "@/lib/catalog/collections-config";
import { brandTerms, characterTerms } from "@/lib/catalog/brands";

/** What a node's row should look like once synced. */
function desiredRow(node: FlatCollectionSeed, position: number) {
  return {
    slug: node.slug,
    name: node.name,
    kind: node.kind,
    description: node.description ?? null,
    icon: node.icon ?? null,
    accentColor: node.accentColor ?? null,
    featured: Boolean(node.featured),
    position,
    status: "active" as const,
    source: "config" as const,
  };
}

/**
 * The spellings a config node should start life with: its own `match` terms
 * plus whatever the brand registry knows the same id by.
 *
 * Only ever used to *fill* an empty column, never to overwrite one. An operator
 * who teaches Sanrio a new spelling must not lose it to the next taxonomy sync,
 * and the canon aliases are unioned in at merge time regardless — so there is
 * nothing to be gained by re-asserting them here.
 */
function seedAliases(node: FlatCollectionSeed): string[] {
  const fromRegistry =
    node.kind === "brand"
      ? brandTerms(node.slug)
      : node.kind === "character"
        ? characterTerms(node.slug)
        : [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of [...(node.match ?? []), ...fromRegistry]) {
    const key = term.trim().toLowerCase();
    // The display name always matches on its own; repeating it is noise in the
    // admin's alias field.
    if (!key || key === node.name.toLowerCase() || seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

export type TaxonomyDrift = {
  /** Config nodes with no row in the table yet. */
  missing: { slug: string; name: string }[];
  /** Rows whose name/kind/art/placement no longer match the config. */
  outdated: { slug: string; name: string }[];
  /** Total nodes in the config taxonomy. */
  total: number;
};

export const NO_TAXONOMY_DRIFT: TaxonomyDrift = {
  missing: [],
  outdated: [],
  total: 0,
};

/**
 * Compare the config taxonomy against the table. Read-only and cheap (one
 * query), so it is safe to run on every admin page render.
 */
export async function diffCollectionTaxonomy(): Promise<TaxonomyDrift> {
  if (!isDbConfigured()) return NO_TAXONOMY_DRIFT;

  const flat = flattenTaxonomy();
  const rows = await db.query.collections.findMany({
    columns: {
      id: true,
      slug: true,
      name: true,
      kind: true,
      description: true,
      icon: true,
      accentColor: true,
      featured: true,
      position: true,
      status: true,
      parentId: true,
      aliases: true,
    },
  });
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const idBySlug = new Map(rows.map((r) => [r.slug, r.id]));

  const missing: TaxonomyDrift["missing"] = [];
  const outdated: TaxonomyDrift["outdated"] = [];

  flat.forEach((node, index) => {
    const row = bySlug.get(node.slug);
    if (!row) {
      missing.push({ slug: node.slug, name: node.name });
      return;
    }
    const want = desiredRow(node, index);
    const wantParentId = node.parentSlug
      ? (idBySlug.get(node.parentSlug) ?? null)
      : null;
    // A node that has never been given its spellings still has work pending;
    // one that has them is left alone, edits and all.
    const aliasesUnseeded =
      (row.aliases ?? []).length === 0 && seedAliases(node).length > 0;

    const drifted =
      aliasesUnseeded ||
      row.name !== want.name ||
      row.kind !== want.kind ||
      row.description !== want.description ||
      row.icon !== want.icon ||
      row.accentColor !== want.accentColor ||
      row.featured !== want.featured ||
      row.position !== want.position ||
      row.status !== want.status ||
      row.parentId !== wantParentId;
    if (drifted) outdated.push({ slug: node.slug, name: node.name });
  });

  return { missing, outdated, total: flat.length };
}

export type TaxonomySyncResult = {
  inserted: number;
  updated: number;
  total: number;
};

/**
 * Upsert every config node by slug, then wire up `parent_id` in a second pass
 * (a child can be defined before its parent has an id). Idempotent: re-running
 * with no config change writes nothing.
 */
export async function applyCollectionTaxonomy(): Promise<TaxonomySyncResult> {
  const flat = flattenTaxonomy();
  const existing = await db.query.collections.findMany({
    columns: { id: true, slug: true, aliases: true },
  });
  const idBySlug = new Map(existing.map((r) => [r.slug, r.id]));
  const aliasesBySlug = new Map(existing.map((r) => [r.slug, r.aliases ?? []]));

  let inserted = 0;
  let updated = 0;

  // Pass 1 — content. Every id exists after this, so parents can be linked.
  for (const [index, node] of flat.entries()) {
    const values = { ...desiredRow(node, index), updatedAt: new Date() };
    const id = idBySlug.get(node.slug);
    if (id != null) {
      // Fill the alias column the first time a node meets this code, then
      // leave it to the operator for good.
      const current = aliasesBySlug.get(node.slug) ?? [];
      await db
        .update(collections)
        .set(
          current.length === 0
            ? { ...values, aliases: seedAliases(node) }
            : values,
        )
        .where(eq(collections.id, id));
      updated += 1;
      continue;
    }
    const [row] = await db
      .insert(collections)
      .values({ ...values, aliases: seedAliases(node) })
      .returning({ id: collections.id });
    idBySlug.set(node.slug, row.id);
    inserted += 1;
  }

  // Pass 2 — hierarchy.
  for (const node of flat) {
    const id = idBySlug.get(node.slug);
    if (id == null) continue;
    const parentId = node.parentSlug
      ? (idBySlug.get(node.parentSlug) ?? null)
      : null;
    await db
      .update(collections)
      .set({ parentId })
      .where(eq(collections.id, id));
  }

  return { inserted, updated, total: flat.length };
}

/** Resolve taxonomy slugs to live collection ids, skipping unseeded ones. */
export async function collectionIdsForSlugs(
  slugs: string[],
): Promise<Map<string, number>> {
  if (slugs.length === 0) return new Map();
  const rows = await db.query.collections.findMany({
    where: inArray(collections.slug, slugs),
    columns: { id: true, slug: true },
  });
  return new Map(rows.map((r) => [r.slug, r.id]));
}

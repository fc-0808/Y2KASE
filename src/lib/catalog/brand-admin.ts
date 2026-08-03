/**
 * Create, rename and delete the brands and characters the catalogue can be
 * classified into.
 *
 * Every write here lands on a `collections` row, because a brand and its browse
 * node are the same thing (see `./brand-registry`). That is what makes a brand
 * created at 11am classifiable, filable and browsable at 11:01 without a deploy
 * — and what stops the two from ever drifting apart again.
 *
 * ── What may be changed ─────────────────────────────────────────────────────
 * Entries defined in `collections-config.ts` are canon: the guard suite and the
 * pure title contract both run against them with no database, so they can be
 * renamed and given new spellings but never deleted. Operator-created entries
 * are fully mutable. A node that still has products filed under it is never
 * deleted silently — the caller has to say what should happen to them.
 */
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { collections, productCollections } from "@/lib/db/schema";
import {
  isBuiltInBrand,
  isBuiltInCharacter,
  resolveBrandAssignment,
} from "@/lib/catalog/brands";

export type BrandWriteResult =
  | { ok: true; slug: string; message: string }
  | { ok: false; message: string };

/** Reserved because they name a browse axis, not an IP. */
const RESERVED_SLUGS = new Set(["all", "new", "sale", "products", "collections"]);

const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * A URL-safe slug for a display name. Doubles as the registry id, so it is
 * generated once at creation and never derived again — renaming a brand must
 * not move its browse URL or orphan the products filed under it.
 */
export function slugifyBrand(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Split an operator's comma/newline separated alias input. */
export function parseAliases(raw: string): string[] {
  return dedupe(raw.split(/[,\n]/).map((p) => p.trim().replace(/\s+/g, " ")));
}

/** Drop blanks and case-insensitive repeats, keeping first-seen order. */
function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out.slice(0, 24);
}

function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 2) return "Give the brand a name of at least 2 characters.";
  if (trimmed.length > 60) return "That name is too long — 60 characters max.";
  return null;
}

/**
 * Create a brand, or a character inside one.
 *
 * `parentBrandId` is the slug of an existing brand; omit it for a top-level
 * brand. Adding a character to a built-in brand is allowed and common — that is
 * how Sanrio gains a face the canon never listed.
 */
export async function createBrandEntry(input: {
  name: string;
  aliases?: string[];
  parentBrandId?: string | null;
  icon?: string | null;
  accentColor?: string | null;
}): Promise<BrandWriteResult> {
  const nameError = validateName(input.name);
  if (nameError) return { ok: false, message: nameError };

  const name = input.name.trim();
  const slug = slugifyBrand(name);
  if (!SLUG_SHAPE.test(slug)) {
    return {
      ok: false,
      message: `“${name}” has no usable URL form. Use letters and numbers.`,
    };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, message: `“${slug}” is reserved.` };
  }

  const clash = await db.query.collections.findFirst({
    where: eq(collections.slug, slug),
    columns: { id: true, name: true, kind: true },
  });
  if (clash) {
    return {
      ok: false,
      message: `“${clash.name}” already exists as a ${clash.kind}.`,
    };
  }

  // A name that already classifies to something else would make the two
  // ambiguous, and `bestTerm` would silently pick one. Refuse instead.
  const existing = resolveBrandAssignment(name, null);
  if (existing.ok) {
    return {
      ok: false,
      message: `“${name}” already resolves to ${existing.brand.brand}${
        existing.character ? ` / ${existing.character.name}` : ""
      }. Add it as a spelling there instead.`,
    };
  }

  let parentId: number | null = null;
  if (input.parentBrandId) {
    const parent = await db.query.collections.findFirst({
      where: eq(collections.slug, input.parentBrandId),
      columns: { id: true, kind: true, name: true },
    });
    if (!parent) return { ok: false, message: "That brand no longer exists." };
    if (parent.kind !== "brand") {
      return {
        ok: false,
        message: `Characters belong to a brand — “${parent.name}” is a ${parent.kind}.`,
      };
    }
    parentId = parent.id;
  }

  await db.insert(collections).values({
    slug,
    name,
    kind: parentId === null ? "brand" : "character",
    aliases: input.aliases ?? [],
    source: "custom",
    parentId,
    icon: input.icon ?? null,
    accentColor: input.accentColor ?? null,
    // Unfeatured: an empty collection has no business in the mega-menu, and the
    // storefront already hides unfeatured nodes with no stock.
    featured: false,
    status: "active",
    position: 999,
  });

  return {
    ok: true,
    slug,
    message: `Added ${name}. It is now selectable and browsable.`,
  };
}

/** Rename an entry and/or replace its spellings. */
export async function updateBrandEntry(input: {
  slug: string;
  name: string;
  aliases: string[];
  icon?: string | null;
  accentColor?: string | null;
}): Promise<BrandWriteResult> {
  const nameError = validateName(input.name);
  if (nameError) return { ok: false, message: nameError };

  const row = await db.query.collections.findFirst({
    where: eq(collections.slug, input.slug),
    columns: { id: true, kind: true, name: true },
  });
  if (!row) return { ok: false, message: "That entry no longer exists." };

  const name = input.name.trim();
  const nameClash = await db.query.collections.findFirst({
    where: and(eq(collections.name, name), ne(collections.id, row.id)),
    columns: { slug: true },
  });
  if (nameClash) {
    return { ok: false, message: `“${name}” is already used by another entry.` };
  }

  // Carry the previous spelling forward on a rename. Products already written
  // as `brand_name = 'Sumikko Gurashi'` must not stop resolving because someone
  // shortened the display name — the same guarantee the canon merge makes.
  const aliases =
    name === row.name
      ? input.aliases
      : dedupe([...input.aliases, row.name]);

  await db
    .update(collections)
    .set({
      name,
      aliases,
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.accentColor !== undefined
        ? { accentColor: input.accentColor }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(collections.id, row.id));

  return {
    ok: true,
    slug: input.slug,
    message:
      name === row.name
        ? `Updated the spellings for ${name}.`
        : `Renamed ${row.name} to ${name}.`,
  };
}

export type BrandDeleteResult = BrandWriteResult & {
  /** Products still filed here when the delete was refused. */
  inUse?: number;
};

/**
 * Delete an operator-created entry.
 *
 * Refuses on two grounds, both of which would otherwise lose data quietly:
 * canon entries are owned by source control and a taxonomy sync would simply
 * recreate them, and a node with products under it is somebody's browse route.
 * Pass `unfile` to remove those memberships as part of the same operation.
 */
export async function deleteBrandEntry(
  slug: string,
  unfile = false,
): Promise<BrandDeleteResult> {
  if (isBuiltInBrand(slug) || isBuiltInCharacter(slug)) {
    return {
      ok: false,
      message: `${slug} is defined in the code taxonomy — a taxonomy sync would bring it straight back. Remove it from collections-config.ts instead.`,
    };
  }

  const row = await db.query.collections.findFirst({
    where: eq(collections.slug, slug),
    columns: { id: true, name: true, kind: true },
  });
  if (!row) return { ok: false, message: "That entry no longer exists." };

  const children = await db.query.collections.findMany({
    where: eq(collections.parentId, row.id),
    columns: { id: true, name: true },
  });
  if (children.length > 0) {
    return {
      ok: false,
      message: `${row.name} still has ${children.length} character${
        children.length === 1 ? "" : "s"
      } under it. Delete ${children.length === 1 ? "it" : "them"} first.`,
    };
  }

  const memberships = await db
    .select({ productId: productCollections.productId })
    .from(productCollections)
    .where(eq(productCollections.collectionId, row.id));

  if (memberships.length > 0 && !unfile) {
    return {
      ok: false,
      message: `${memberships.length} product${
        memberships.length === 1 ? " is" : "s are"
      } still filed under ${row.name}.`,
      inUse: memberships.length,
    };
  }

  if (memberships.length > 0) {
    await db
      .delete(productCollections)
      .where(eq(productCollections.collectionId, row.id));
  }
  await db.delete(collections).where(eq(collections.id, row.id));

  return {
    ok: true,
    slug,
    message: `Deleted ${row.name}${
      memberships.length > 0
        ? ` and unfiled ${memberships.length} product${memberships.length === 1 ? "" : "s"}`
        : ""
    }.`,
  };
}

/** Products still classified under a set of slugs — used to warn before delete. */
export async function productsClassifiedAs(
  slugs: string[],
): Promise<Map<string, number>> {
  if (slugs.length === 0) return new Map();
  const rows = await db
    .select({
      slug: collections.slug,
      productId: productCollections.productId,
    })
    .from(productCollections)
    .innerJoin(collections, eq(collections.id, productCollections.collectionId))
    .where(inArray(collections.slug, slugs));

  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.slug, (counts.get(row.slug) ?? 0) + 1);
  }
  return counts;
}

/**
 * Server-only core for "this product is actually a <brand> / <character>".
 *
 * Writing that decision means two things must move together: the denormalised
 * brand columns on `products`, and the product's membership in the brand and
 * character collections that drive the browse tree. Doing them in one place is
 * what keeps the admin, the backfill script and any future importer honest.
 *
 * Genre ("kawaii", "y2k") and feature ("magsafe") memberships are curated on a
 * different axis and are never touched here. Originals is the exception: it is
 * the inverse of the brand axis (no licensed IP → file; licensed IP → unfile).
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { collections, productCollections, products } from "@/lib/db/schema";
import {
  BRAND_COLLECTION_KINDS,
  ORIGINALS_SLUG,
  taxonomySlugChain,
} from "@/lib/catalog/collections-config";
import { collectionIdsForSlugs } from "@/lib/catalog/taxonomy-sync";
import {
  excludedCollectionSlugs,
  isUnlicensedProduct,
  mergeAssignmentEvidence,
  resolveBrandAssignment,
  withCollectionExclusion,
  type BrandConfidence,
} from "@/lib/catalog/brands";

export type BrandCollectionSync = {
  /** Slugs the product is now a member of. */
  linked: string[];
  /** Stale brand/character slugs the product was removed from. */
  removed: string[];
  /**
   * Slugs the taxonomy defines but the database doesn't have yet — i.e. the
   * config was edited without running a taxonomy sync. Surfaced rather than
   * swallowed, because silently skipping them is precisely how a brand goes
   * missing from the browse tree.
   */
  unseeded: string[];
};

/**
 * Re-point a single product's brand/character collection membership.
 *
 * Assigning a character also assigns its parent brand (Hello Kitty ⇒ Sanrio),
 * because the taxonomy chain is walked to the root.
 *
 * REGRESSION GUARD: the delete is scoped by `productId`. An earlier version
 * filtered on `collectionId` alone, so correcting one product's brand emptied
 * every brand and character collection in the catalogue.
 */
export async function syncBrandCollections(
  productId: number,
  brandId: string | null,
  characterId: string | null,
): Promise<BrandCollectionSync> {
  const wanted = new Set<string>([
    ...(characterId ? taxonomySlugChain(characterId) : []),
    ...(brandId ? taxonomySlugChain(brandId) : []),
  ]);

  // An operator can remove a filing the title still names ("this bunny is not
  // Miffy"). The authoritative pass must not put that collection back.
  const stored = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { brandEvidence: true },
  });
  for (const slug of excludedCollectionSlugs(stored?.brandEvidence)) {
    wanted.delete(slug);
  }

  const current = await db
    .select({
      collectionId: productCollections.collectionId,
      slug: collections.slug,
      kind: collections.kind,
    })
    .from(productCollections)
    .innerJoin(collections, eq(collections.id, productCollections.collectionId))
    .where(eq(productCollections.productId, productId));

  const stale = current.filter(
    (row) => BRAND_COLLECTION_KINDS.has(row.kind) && !wanted.has(row.slug),
  );
  if (stale.length > 0) {
    await db.delete(productCollections).where(
      and(
        eq(productCollections.productId, productId),
        inArray(
          productCollections.collectionId,
          stale.map((row) => row.collectionId),
        ),
      ),
    );
  }

  const idBySlug = await collectionIdsForSlugs([...wanted]);
  const toLink = [...idBySlug.values()];
  if (toLink.length > 0) {
    await db
      .insert(productCollections)
      .values(toLink.map((collectionId) => ({ productId, collectionId })))
      .onConflictDoNothing();
  }

  return {
    linked: [...idBySlug.keys()],
    removed: stale.map((row) => row.slug),
    unseeded: [...wanted].filter((slug) => !idBySlug.has(slug)),
  };
}

/**
 * File unlicensed products into Originals, and take licensed ones back out.
 *
 * Genre filing is additive and keyword-matched, which cannot express "has no
 * brand". Originals is the inverse of the brand axis: membership is a function
 * of whether the product currently has a resolvable IP, so assigning a brand
 * automatically leaves the shelf and clearing one automatically enters it.
 */
export async function syncOriginalsMembership(
  productId: number,
  brandName: string | null,
  characterName: string | null,
): Promise<{ linked: boolean; removed: boolean; unseeded: boolean }> {
  const wanted = isUnlicensedProduct(brandName, characterName);
  const idBySlug = await collectionIdsForSlugs([ORIGINALS_SLUG]);
  const originalsId = idBySlug.get(ORIGINALS_SLUG);
  if (!originalsId) {
    return { linked: false, removed: false, unseeded: wanted };
  }

  const [existing] = await db
    .select({ collectionId: productCollections.collectionId })
    .from(productCollections)
    .where(
      and(
        eq(productCollections.productId, productId),
        eq(productCollections.collectionId, originalsId),
      ),
    )
    .limit(1);

  if (wanted) {
    if (existing) return { linked: false, removed: false, unseeded: false };
    await db
      .insert(productCollections)
      .values({ productId, collectionId: originalsId })
      .onConflictDoNothing();
    return { linked: true, removed: false, unseeded: false };
  }

  if (!existing) return { linked: false, removed: false, unseeded: false };
  await db
    .delete(productCollections)
    .where(
      and(
        eq(productCollections.productId, productId),
        eq(productCollections.collectionId, originalsId),
      ),
    );
  return { linked: false, removed: true, unseeded: false };
}

export type BrandAssignment = {
  brandId: string | null;
  brandName: string | null;
  characterId: string | null;
  characterName: string | null;
  confidence: BrandConfidence;
  evidence: string[];
};

/**
 * Persist a brand assignment and reconcile collection membership. Pass an
 * assignment with a null brand to clear the classification entirely.
 */
export async function applyBrandAssignment(
  productId: number,
  assignment: BrandAssignment,
): Promise<BrandCollectionSync> {
  const previous = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { brandEvidence: true },
  });
  const wantedSlugs = [
    ...(assignment.characterId ? taxonomySlugChain(assignment.characterId) : []),
    ...(assignment.brandId ? taxonomySlugChain(assignment.brandId) : []),
  ];

  await db
    .update(products)
    .set({
      brandName: assignment.brandName,
      characterName: assignment.characterName,
      brandConfidence: assignment.confidence,
      brandEvidence: mergeAssignmentEvidence(
        previous?.brandEvidence,
        assignment.evidence,
        wantedSlugs,
      ),
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId));

  const brandSync = await syncBrandCollections(
    productId,
    assignment.brandId,
    assignment.characterId,
  );
  await syncOriginalsMembership(
    productId,
    assignment.brandName,
    assignment.characterName,
  );
  return brandSync;
}

/**
 * Remember that an operator took this product out of a brand collection.
 *
 * Membership deletion alone does not stick: the next refile reads the title,
 * sees "Miffy", and files it again. The exclusion marker blocks that. When
 * the collection *is* the stored character (or the brand, if no finer
 * character is set), the classification is cleared too — otherwise the
 * authoritative brand sync puts the product straight back.
 */
export async function releaseBrandCollection(
  productId: number,
  collection: { slug: string; kind: string },
): Promise<{ cleared: "brand" | "character" | null }> {
  if (!BRAND_COLLECTION_KINDS.has(collection.kind)) return { cleared: null };

  const row = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: {
      brandName: true,
      characterName: true,
      brandEvidence: true,
    },
  });
  if (!row) return { cleared: null };

  let brandName = row.brandName;
  let characterName = row.characterName;
  let cleared: "brand" | "character" | null = null;
  const resolved = resolveBrandAssignment(row.brandName, row.characterName);
  if (resolved.ok) {
    const characterId = resolved.character?.id ?? null;
    const brandId = resolved.brand.id;
    if (characterId && collection.slug === characterId) {
      if (characterId === brandId) {
        brandName = null;
        characterName = null;
        cleared = "brand";
      } else {
        characterName = null;
        cleared = "character";
      }
    } else if (!characterId && collection.slug === brandId) {
      brandName = null;
      characterName = null;
      cleared = "brand";
    }
  }

  await db
    .update(products)
    .set({
      brandName,
      characterName,
      ...(cleared === "brand" ? { brandConfidence: "none" } : {}),
      brandEvidence: withCollectionExclusion(
        row.brandEvidence,
        collection.slug,
        true,
      ),
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId));

  if (brandName !== row.brandName || characterName !== row.characterName) {
    await syncOriginalsMembership(productId, brandName, characterName);
  }

  return { cleared };
}

/**
 * The operator put the product back in a collection they had ruled out.
 * Drop the marker so filing is allowed to keep it.
 */
export async function allowBrandCollection(
  productId: number,
  collection: { slug: string; kind: string },
): Promise<void> {
  if (!BRAND_COLLECTION_KINDS.has(collection.kind)) return;
  const row = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { brandEvidence: true },
  });
  if (!row) return;
  const next = withCollectionExclusion(row.brandEvidence, collection.slug, false);
  const prev = row.brandEvidence ?? [];
  if (next.length === prev.length && next.every((entry, i) => entry === prev[i])) {
    return;
  }
  await db
    .update(products)
    .set({ brandEvidence: next, updatedAt: new Date() })
    .where(eq(products.id, productId));
}

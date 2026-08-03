/**
 * Server-only core for "this product is actually a <brand> / <character>".
 *
 * Writing that decision means two things must move together: the denormalised
 * brand columns on `products`, and the product's membership in the brand and
 * character collections that drive the browse tree. Doing them in one place is
 * what keeps the admin, the backfill script and any future importer honest.
 *
 * Genre ("kawaii", "y2k") and feature ("magsafe") memberships are curated on a
 * different axis and are never touched here.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { collections, productCollections, products } from "@/lib/db/schema";
import {
  BRAND_COLLECTION_KINDS,
  taxonomySlugChain,
} from "@/lib/catalog/collections-config";
import { collectionIdsForSlugs } from "@/lib/catalog/taxonomy-sync";
import type { BrandConfidence } from "@/lib/catalog/brands";

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
  await db
    .update(products)
    .set({
      brandName: assignment.brandName,
      characterName: assignment.characterName,
      brandConfidence: assignment.confidence,
      brandEvidence: assignment.evidence,
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId));

  return syncBrandCollections(
    productId,
    assignment.brandId,
    assignment.characterId,
  );
}

/**
 * Re-derive a single product's place in the browse tree from its current state.
 *
 * Collection membership used to be decided exactly once, during ingest, by
 * matching the then-current title and tags against the taxonomy's keywords. That
 * is fine for a product whose copy is never touched again, and wrong for every
 * other one: correct a title from "Mint Green Kawaii Bear" to "Rilakkuma …" and
 * the product stays filed exactly where the old, wrong title put it. The fix
 * that made the listing findable does not make it browsable.
 *
 * So filing is a function of state rather than an event, and it runs on every
 * write that can change that state — a retitle, a brand reassignment, a
 * backfill. The two axes are reconciled differently on purpose:
 *
 *   • Brand and character are AUTHORITATIVE, but only when the stored
 *     classification is corroborated by the product's own text. A brand column
 *     is not automatically the truth: some rows were written by an early
 *     classifier and say "Hello Kitty" on a case whose own title says
 *     Cinnamoroll. Treating those as authoritative deletes the correct
 *     membership and files the product under the wrong character — the exact
 *     failure the title audit exists to catch. So when the title and the column
 *     disagree, or nothing corroborates the column at all, the brand axis is
 *     HELD: membership is left untouched and the caller is told why.
 *     `syncBrandCollections` owns the authoritative path, product-scoped.
 *
 *   • Genre and feature are ADDITIVE. "Kawaii", "Y2K" and "MagSafe" are
 *     multi-valued, and an operator may have curated them by hand; a keyword
 *     miss on this run is not evidence that a human's earlier decision was
 *     wrong. Adding what the text now implies is safe, removing is not —
 *     except MagSafe on a product type that cannot offer it, which is a
 *     category error and is stripped.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { collections, productCollections, products } from "@/lib/db/schema";
import {
  BRAND_COLLECTION_KINDS,
  flattenTaxonomy,
  matchCollectionSlugs,
  MAGSAFE_SLUG,
  ORIGINALS_SLUG,
} from "@/lib/catalog/collections-config";
import {
  filterMagSafeCollectionSlugs,
  productTypeOffersMagSafe,
} from "@/lib/catalog/devices";
import { collectionIdsForSlugs } from "@/lib/catalog/taxonomy-sync";
import {
  isOperatorConfirmed,
  resolveBrandAssignment,
} from "@/lib/catalog/brands";
import { ensureBrandRegistry } from "@/lib/catalog/brand-registry";
import {
  syncBrandCollections,
  syncOriginalsMembership,
} from "@/lib/catalog/brand-assignment";
import { ipVerdict, listingIp } from "@/lib/catalog/listing-title";

export type RefileResult = {
  /** Collections the product was newly added to. */
  added: string[];
  /** Brand/character collections it was moved out of. */
  removed: string[];
  /** Slugs the taxonomy defines that the database has not been given yet. */
  unseeded: string[];
  /**
   * Why the brand axis was skipped, when it was. Never a silent no-op: an
   * operator has to be able to tell "already filed correctly" apart from "we
   * refused to file this because the classification is in doubt".
   */
  held: "brand_conflict" | "brand_unverified" | "brand_unresolved" | null;
};

export const NO_REFILE: RefileResult = {
  added: [],
  removed: [],
  unseeded: [],
  held: null,
};

/** Taxonomy slugs that the brand axis owns, so the genre pass leaves them be. */
function brandOwnedSlugs(): Set<string> {
  return new Set(
    flattenTaxonomy()
      .filter((node) => BRAND_COLLECTION_KINDS.has(node.kind))
      .map((node) => node.slug),
  );
}

/**
 * Reconcile one product's collection membership against its stored title, tags,
 * source folder and brand classification.
 *
 * Safe to call after any write and safe to call twice — the brand pass is
 * idempotent by construction and the genre pass inserts on conflict-do-nothing.
 */
export async function refileProduct(productId: number): Promise<RefileResult> {
  await ensureBrandRegistry();
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: {
      id: true,
      title: true,
      tags: true,
      sourceFolder: true,
      brandName: true,
      characterName: true,
      brandEvidence: true,
      productType: true,
    },
  });
  if (!product) return NO_REFILE;

  // ── Brand / character: authoritative, but only when corroborated ──────────
  const resolved = resolveBrandAssignment(
    product.brandName,
    product.characterName,
  );
  const held = brandAxisHold(product, resolved.ok);

  const brandSync = held
    ? { linked: [], removed: [], unseeded: [] }
    : await syncBrandCollections(
        productId,
        resolved.ok ? resolved.brand.id : null,
        resolved.ok ? (resolved.character?.id ?? null) : null,
      );

  // ── Genre / feature: additive ─────────────────────────────────────────────
  // The keyword matcher also hits brand and character nodes (a title saying
  // "Rilakkuma" matches the Rilakkuma collection). While the authoritative pass
  // is running they are excluded, so the additive pass cannot re-add a brand it
  // just removed. When that pass is HELD they are allowed through instead: the
  // column is the thing in doubt, the title is not, and filing a product under
  // the character its own title names — without removing anything — is the
  // safest reading available until a human settles it.
  const owned = brandOwnedSlugs();
  const wanted = filterMagSafeCollectionSlugs(
    matchCollectionSlugs({
      tags: product.tags,
      title: product.title,
      sourceFolder: product.sourceFolder,
    }).filter((slug) => held !== null || !owned.has(slug)),
    product.productType,
  );

  const idBySlug = await collectionIdsForSlugs(wanted);
  const unseeded = wanted.filter((slug) => !idBySlug.has(slug));

  const added: string[] = [];
  if (idBySlug.size > 0) {
    const ids = [...idBySlug.values()];
    const existing = await db
      .select({ collectionId: productCollections.collectionId })
      .from(productCollections)
      .where(eq(productCollections.productId, productId));
    const already = new Set(existing.map((row) => row.collectionId));
    const missing = ids.filter((id) => !already.has(id));

    if (missing.length > 0) {
      await db
        .insert(productCollections)
        .values(missing.map((collectionId) => ({ productId, collectionId })))
        .onConflictDoNothing();

      const namesById = new Map(
        [...idBySlug].map(([slug, id]) => [id, slug] as const),
      );
      added.push(
        ...missing.map((id) => namesById.get(id)).filter((s): s is string => !!s),
      );
    }
  }

  const originals = await syncOriginalsMembership(
    productId,
    product.brandName,
    product.characterName,
  );

  // MagSafe on a non-phone type is a category error, not a curated feature.
  // The genre pass is additive and will not delete it; this pass must.
  const strippedMagSafe = await stripIneligibleMagSafe(
    productId,
    product.productType,
  );

  return {
    added: [
      ...new Set([
        ...brandSync.linked,
        ...added,
        ...(originals.linked ? [ORIGINALS_SLUG] : []),
      ]),
    ],
    removed: [
      ...new Set([
        ...brandSync.removed,
        ...(originals.removed ? [ORIGINALS_SLUG] : []),
        ...(strippedMagSafe ? [MAGSAFE_SLUG] : []),
      ]),
    ],
    unseeded: [
      ...new Set([
        ...brandSync.unseeded,
        ...unseeded,
        ...(originals.unseeded ? [ORIGINALS_SLUG] : []),
      ]),
    ],
    held,
  };
}

/**
 * Decide whether the brand axis may act on this product, or must stand down.
 *
 * Filing on the brand axis is destructive — it moves a product out of a
 * collection — so it demands a higher standard of evidence than the additive
 * genre pass. The rule is that the stored classification has to be supported by
 * something the product itself says, or by a human who said so explicitly. A
 * column that contradicts the title, or that nothing anywhere corroborates, is
 * a claim under dispute, and a disputed claim does not get to delete a
 * shopper's route to the product.
 */
function brandAxisHold(
  product: {
    title: string;
    tags: string[];
    sourceFolder: string | null;
    brandName: string | null;
    characterName: string | null;
    brandEvidence: string[] | null;
  },
  resolves: boolean,
): RefileResult["held"] {
  const ip = listingIp(product.brandName, product.characterName);
  // Nothing stored: there is no classification to enforce, and an empty column
  // is not evidence that the product belongs nowhere.
  if (!ip) return resolves ? null : "brand_unresolved";
  if (!resolves) return "brand_unresolved";

  const verdict = ipVerdict(product.title, {
    ip,
    ipEvidence: [...product.tags, product.sourceFolder ?? ""],
    ipConfirmed: isOperatorConfirmed(product.brandEvidence),
    // The brand verdict reads none of these; they satisfy the fact shape.
    productTypeId: "",
    models: [],
    magsafe: false,
  });
  if (verdict === "conflict") return "brand_conflict";
  if (verdict === "unverified") return "brand_unverified";
  return null;
}

/**
 * Drop MagSafe collection membership when the product type cannot offer it.
 * Returns true when a row was actually removed.
 */
async function stripIneligibleMagSafe(
  productId: number,
  productType: string,
): Promise<boolean> {
  if (productTypeOffersMagSafe(productType)) return false;
  const idBySlug = await collectionIdsForSlugs([MAGSAFE_SLUG]);
  const magsafeId = idBySlug.get(MAGSAFE_SLUG);
  if (magsafeId === undefined) return false;
  const deleted = await db
    .delete(productCollections)
    .where(
      and(
        eq(productCollections.productId, productId),
        eq(productCollections.collectionId, magsafeId),
      ),
    )
    .returning({ collectionId: productCollections.collectionId });
  return deleted.length > 0;
}

/**
 * Where a product currently sits in the browse tree, in taxonomy order.
 *
 * Filing happens as a side effect of title and brand writes, so the admin shows
 * the outcome — an operator can see that a rename actually moved the product
 * instead of taking the toast's word for it.
 */
export async function currentCollectionSlugs(
  productId: number,
): Promise<string[]> {
  const rows = await db
    .select({ slug: collections.slug })
    .from(productCollections)
    .innerJoin(collections, eq(collections.id, productCollections.collectionId))
    .where(eq(productCollections.productId, productId));

  const order = flattenTaxonomy().map((node) => node.slug);
  const rank = (slug: string) => {
    const at = order.indexOf(slug);
    return at === -1 ? order.length : at;
  };
  return rows
    .map((row) => row.slug)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

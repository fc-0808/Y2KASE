"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { revalidateStorefrontCatalog } from "@/lib/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  products,
  productImages,
  productOptions,
  productCollections,
  collections,
} from "@/lib/db/schema";
import { applyMagSafeCopy, removeMagSafeCopy } from "@/lib/catalog/magsafe";
import { applyCollectionTaxonomy } from "@/lib/catalog/taxonomy-sync";
import { refileProduct } from "@/lib/catalog/collection-filing";
import { auditCatalogClassification } from "@/lib/catalog/classification-health-service";
import {
  classifyBrandContext,
  listBrandOptions,
  resolveBrandAssignment,
  type BrandOption,
} from "@/lib/catalog/brands";
import { ensureBrandRegistry } from "@/lib/catalog/brand-registry";
import {
  createBrandEntry,
  deleteBrandEntry,
  parseAliases,
  productsClassifiedAs,
  updateBrandEntry,
  type BrandDeleteResult,
  type BrandWriteResult,
} from "@/lib/catalog/brand-admin";
import { repairListingTitle } from "@/lib/catalog/listing-title";
import {
  loadProductTitleState,
  rewriteTitleKeepingBrand,
} from "@/lib/catalog/listing-title-service";
import { updateProductBrand, updateProductTitle } from "./[id]/actions";
import { requireAdmin } from "@/lib/auth";
import {
  MODEL_OPTION_NAME,
  STYLE_OPTION_NAME,
  STYLES,
  IPHONE_MODELS,
  orderStyles,
  orderModels,
  stylesForAddons,
  defaultStyleFor,
  getStylePrice,
  normalizeImageStyleTags,
  imageStyleTagsAreCanonical,
} from "@/lib/pricing";
import { saveProductVariations } from "@/lib/admin/product-variations";
import {
  approveProposal,
  setProposalDecision,
  approveProposals,
  decideProposals,
} from "@/lib/admin/thumbnails";
import {
  generateProposalsForPending,
  regenerateProposalWithAiCleanup,
  regenerateProposalsWithAiCleanup,
  recropProposal,
  removeBackgroundProposal,
  type CropRect,
} from "@/lib/admin/thumbnails-generate";
import {
  parseThumbnailScope,
  DEFAULT_THUMBNAIL_SCOPE,
  type ThumbnailScope,
} from "@/lib/admin/thumbnail-scope";
import {
  makeR2Client,
  deleteObjectsFromR2,
  r2KeyFromUrl,
} from "@/lib/catalog/r2";
import { productTypeLabel } from "@/lib/catalog/product-types";

const VALID_STYLES = new Set<string>(STYLES);
const VALID_MODELS = new Set<string>(IPHONE_MODELS);

/** Re-prime every surface a catalog change can affect. */
function revalidateCatalog(productId?: number) {
  if (productId != null) revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products");
  revalidatePath("/products");
  // Product detail pages are ISR-cached per slug; invalidate the whole dynamic
  // route so edited media/variations/availability appear immediately rather
  // than after the hourly ISR window. (Dynamic segment → requires `type`.)
  revalidatePath("/products/[slug]", "page");
  revalidatePath("/collections");
  revalidatePath("/collections/[slug]", "page");
  revalidatePath("/");
  // Drop the tagged Data Cache entries (featured rail, mega-menu taxonomy,
  // category image pools) so the menu/homepage reflect the change immediately.
  revalidateStorefrontCatalog();
}

// ─────────────────────────────────────────────────────────────────────────────
// Collection membership (browse taxonomy)
//
// Assign or unassign many products to a collection in one batch. Membership is
// idempotent — adding an existing pairing is a no-op. Any product type can
// belong to any collection (collections are marketing groupings, orthogonal to
// the functional productType).
// ─────────────────────────────────────────────────────────────────────────────

export type CollectionAssignResult = {
  ok: boolean;
  message: string;
  changed: number;
};

export async function assignProductsToCollection(
  productIds: number[],
  collectionId: number,
): Promise<CollectionAssignResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized.", changed: 0 };
  }
  const ids = Array.from(new Set(productIds)).filter((n) => Number.isFinite(n));
  if (ids.length === 0 || !Number.isFinite(collectionId)) {
    return { ok: false, message: "Nothing to assign.", changed: 0 };
  }

  await db
    .insert(productCollections)
    .values(ids.map((productId) => ({ productId, collectionId })))
    .onConflictDoNothing();

  revalidateCatalog();
  return {
    ok: true,
    message: `Added ${ids.length} product${ids.length === 1 ? "" : "s"} to collection.`,
    changed: ids.length,
  };
}

/**
 * Push the config taxonomy into the `collections` table.
 *
 * The browse tree is config-as-code, but every picker and filter reads the
 * table — so a brand added in source control is invisible until it is synced.
 * That gap is what hid "Rilakkuma" from the collection dropdown while it sat in
 * `collections-config.ts`. Exposing the sync as a button means the operator who
 * notices the gap can close it, instead of filing it with whoever has a shell.
 *
 * Idempotent, and never touches product membership.
 */
export async function syncCollectionTaxonomy(): Promise<CollectionAssignResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized.", changed: 0 };
  }
  try {
    const { inserted, updated, total } = await applyCollectionTaxonomy();
    revalidateCatalog();
    return {
      ok: true,
      message:
        inserted > 0
          ? `Synced ${total} collections — ${inserted} added.`
          : `Synced ${total} collections — ${updated} refreshed.`,
      changed: inserted,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Taxonomy sync failed.",
      changed: 0,
    };
  }
}

export async function removeProductsFromCollection(
  productIds: number[],
  collectionId: number,
): Promise<CollectionAssignResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized.", changed: 0 };
  }
  const ids = Array.from(new Set(productIds)).filter((n) => Number.isFinite(n));
  if (ids.length === 0 || !Number.isFinite(collectionId)) {
    return { ok: false, message: "Nothing to remove.", changed: 0 };
  }

  await db
    .delete(productCollections)
    .where(
      and(
        eq(productCollections.collectionId, collectionId),
        inArray(productCollections.productId, ids),
      ),
    );

  revalidateCatalog();
  return {
    ok: true,
    message: `Removed ${ids.length} product${ids.length === 1 ? "" : "s"} from collection.`,
    changed: ids.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Single-product lifecycle actions
//
// These are reachable as direct POST requests, so each independently verifies
// the caller is an admin (defense-in-depth — we never rely on the layout guard
// or proxy alone; see src/lib/auth.ts).
// ─────────────────────────────────────────────────────────────────────────────

export async function publishProduct(id: number) {
  if (!(await requireAdmin(await headers()))) return;
  await db
    .update(products)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(products.id, id));
  revalidateCatalog(id);
}

export async function unpublishProduct(id: number) {
  if (!(await requireAdmin(await headers()))) return;
  await db
    .update(products)
    .set({ status: "draft", updatedAt: new Date() })
    .where(eq(products.id, id));
  revalidateCatalog(id);
}

export async function setFeatured(id: number, featured: boolean) {
  if (!(await requireAdmin(await headers()))) return;
  // Maintain the curated bestsellers order: featuring appends to the end of the
  // rail; un-featuring clears its position. The homepage reads this order.
  let featuredPosition: number | null = null;
  if (featured) {
    const [row] = await db
      .select({
        max: sql<number>`coalesce(max(${products.featuredPosition}), -1)`,
      })
      .from(products)
      .where(eq(products.featured, true));
    featuredPosition = (row?.max ?? -1) + 1;
  }
  await db
    .update(products)
    .set({ featured, featuredPosition, updatedAt: new Date() })
    .where(eq(products.id, id));
  revalidateCatalog(id);
}

export async function deleteProduct(id: number) {
  if (!(await requireAdmin(await headers()))) return;
  await deleteProductsAndMedia([id]);
  revalidateCatalog();
}

/**
 * Confirm a queued MagSafe candidate: fold MagSafe into its copy + tags, link
 * the MagSafe collection, and clear the review flag. Idempotent.
 */
export async function confirmMagsafe(id: number) {
  if (!(await requireAdmin(await headers()))) return;
  const product = await db.query.products.findFirst({
    where: eq(products.id, id),
    columns: { id: true, title: true, description: true, tags: true },
  });
  if (!product) return;

  const applied = applyMagSafeCopy({
    title: product.title,
    description: product.description,
    tags: product.tags,
  });
  await db
    .update(products)
    .set({
      title: applied.title,
      description: applied.description,
      tags: applied.tags,
      needsMagsafeReview: false,
      updatedAt: new Date(),
    })
    .where(eq(products.id, id));

  const magCol = await db.query.collections.findFirst({
    where: eq(collections.slug, "magsafe"),
    columns: { id: true },
  });
  if (magCol) {
    await db
      .insert(productCollections)
      .values({ productId: id, collectionId: magCol.id })
      .onConflictDoNothing();
  }
  revalidateCatalog(id);
}

/**
 * Authoritative manual override: mark (or unmark) many products as MagSafe in
 * one action. Vision can't see MagSafe that isn't visible in the photos (e.g.
 * a clear case whose ring isn't shown), so the operator — who knows the product
 * spec — gets the final say. Marking folds MagSafe into title/description/tags +
 * the MagSafe collection; unmarking fully reverts it. Always clears the review
 * flag (a human just decided).
 */
export async function bulkSetMagsafe(
  productIds: number[],
  magsafe: boolean,
): Promise<{ ok: boolean; message: string; changed: number }> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized.", changed: 0 };
  }
  const ids = Array.from(new Set(productIds)).filter((n) => Number.isFinite(n));
  if (ids.length === 0) {
    return { ok: false, message: "No products selected.", changed: 0 };
  }

  const rows = await db.query.products.findMany({
    where: inArray(products.id, ids),
    columns: { id: true, title: true, description: true, tags: true },
  });

  for (const p of rows) {
    const next = magsafe
      ? applyMagSafeCopy({
          title: p.title,
          description: p.description,
          tags: p.tags,
        })
      : removeMagSafeCopy({
          title: p.title,
          description: p.description,
          tags: p.tags,
        });
    await db
      .update(products)
      .set({
        title: next.title,
        description: next.description,
        tags: next.tags,
        needsMagsafeReview: false,
        updatedAt: new Date(),
      })
      .where(eq(products.id, p.id));
  }

  const magCol = await db.query.collections.findFirst({
    where: eq(collections.slug, "magsafe"),
    columns: { id: true },
  });
  if (magCol) {
    if (magsafe) {
      await db
        .insert(productCollections)
        .values(
          ids.map((productId) => ({ productId, collectionId: magCol.id })),
        )
        .onConflictDoNothing();
    } else {
      await db
        .delete(productCollections)
        .where(
          and(
            eq(productCollections.collectionId, magCol.id),
            inArray(productCollections.productId, ids),
          ),
        );
    }
  }

  revalidateCatalog();
  return {
    ok: true,
    message: `${magsafe ? "Marked" : "Unmarked"} ${rows.length} product${rows.length === 1 ? "" : "s"} ${magsafe ? "as" : "from"} MagSafe.`,
    changed: rows.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Classification CRUD, from the list
//
// Correcting one product's identity used to mean opening it, changing the
// brand, going back, and losing your place — for a catalogue where a third of
// the rows were misclassified. These actions do the same writes as the product
// page, addressed by row, so the work can be done in the list where the
// mistakes are visible.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// The brand vocabulary itself
//
// Until now the set of brands the catalogue could recognise was a hard-coded
// array: meeting a new IP — a Sumikko Gurashi case — meant editing source,
// opening a PR and deploying before the product could even be classified. These
// actions move that to runtime. Each one writes a browse node, so a brand
// created here is classifiable, filable and browsable in the same breath.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Expire the cached vocabulary and every surface that renders it.
 *
 * `revalidateCatalog` already drops the `collections` cache tag, which is the
 * one the vocabulary snapshot is stored under — so a brand added here is
 * visible to the next classification without waiting out the hourly window.
 */
function revalidateVocabulary(): void {
  revalidateCatalog();
  revalidatePath("/admin/collections");
}

export async function createBrand(input: {
  name: string;
  aliases: string;
  parentBrandId?: string | null;
  icon?: string | null;
}): Promise<BrandWriteResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized." };
  }
  // The registry has to be current before the duplicate check runs, or a brand
  // added a minute ago would look free and two rows would answer to one name.
  await ensureBrandRegistry();

  const res = await createBrandEntry({
    name: input.name,
    aliases: parseAliases(input.aliases),
    parentBrandId: input.parentBrandId ?? null,
    icon: input.icon ?? null,
  });
  if (res.ok) revalidateVocabulary();
  return res;
}

export async function updateBrand(input: {
  slug: string;
  name: string;
  aliases: string;
  icon?: string | null;
}): Promise<BrandWriteResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized." };
  }
  const res = await updateBrandEntry({
    slug: input.slug,
    name: input.name,
    aliases: parseAliases(input.aliases),
    icon: input.icon ?? null,
  });
  if (res.ok) revalidateVocabulary();
  return res;
}

export async function deleteBrand(
  slug: string,
  unfile = false,
): Promise<BrandDeleteResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized." };
  }
  const res = await deleteBrandEntry(slug, unfile);
  if (res.ok) revalidateVocabulary();
  return res;
}

/** The vocabulary as the manager UI renders it, with usage counts. */
export async function listBrandVocabulary(): Promise<{
  brands: BrandOption[];
  counts: Record<string, number>;
}> {
  if (!(await requireAdmin(await headers()))) {
    return { brands: [], counts: {} };
  }
  await ensureBrandRegistry();
  const brands = listBrandOptions();
  const slugs = brands.flatMap((brand) => [
    brand.id,
    ...brand.characters.map((character) => character.id),
  ]);
  return {
    brands,
    counts: Object.fromEntries(await productsClassifiedAs(slugs)),
  };
}

export type RowClassificationResult = {
  ok: boolean;
  message: string;
  /** The regenerated title, when the reclassification produced one. */
  title?: string | null;
};

/**
 * Set (or clear) one product's brand and character from the list row, and bring
 * its title along.
 *
 * Delegates to the same server action the product page uses, so the operator's
 * decision is stamped with the same provenance marker and reconciled through
 * the same filing path. That marker matters beyond the audit trail: it is what
 * lets the listing-title contract write a confirmed IP into the title even when
 * the product's own text never mentions it.
 *
 * When `retitle` is on, the title is rebuilt from the product photos — not a
 * string swap of the character name. Swapping alone is how a catalogue ends up
 * with sixteen "Miffy Clear Glitter Phone Case" near-duplicates; the vision
 * descriptor is what makes each listing distinguishable. The brand the operator
 * just confirmed is held fixed: the model is only allowed to invent the
 * descriptive phrase. If photos are missing or the model fails, we fall back to
 * the deterministic IP/device repair so the classification still lands cleanly.
 */
export async function setProductClassification(
  productId: number,
  brandId: string | null,
  characterId: string | null,
  retitle: boolean = true,
): Promise<RowClassificationResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized." };
  }

  const res = await updateProductBrand(productId, brandId, characterId);
  if (!res.ok) return { ok: false, message: res.message };

  let note = "";
  let title: string | null = null;

  if (retitle) {
    // Read back *after* the brand write: the rewrite has to see the new
    // classification and the operator-confirmed provenance it just gained.
    try {
      const rewritten = await rewriteTitleKeepingBrand(productId);
      if (rewritten.title) {
        const applied = await updateProductTitle(productId, rewritten.title);
        if (applied.ok && applied.title) {
          title = applied.title;
          const how =
            rewritten.source === "vision"
              ? "from the photos"
              : "with the deterministic fix";
          note = ` Title rewritten ${how}: “${applied.title}”.`;
        } else if (!applied.ok) {
          note = ` The title could not be saved: ${applied.message}`;
        }
      } else if (!rewritten.ok) {
        note = ` The title could not be regenerated: ${rewritten.message}`;
      }
    } catch (err) {
      note = ` The title could not be regenerated: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
  }

  revalidateCatalog(productId);
  return { ok: true, message: `${res.message}${note}`, title };
}

/**
 * Add or remove a single collection for a single product.
 *
 * Deliberately narrower than the bulk assign action: this is the escape hatch
 * for a membership the automatic filing got wrong, and it must be able to
 * remove a brand collection that filing itself would refuse to touch.
 */
export async function setProductCollection(
  productId: number,
  collectionId: number,
  member: boolean,
): Promise<RowClassificationResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized." };
  }
  const collection = await db.query.collections.findFirst({
    where: eq(collections.id, collectionId),
    columns: { id: true, name: true },
  });
  if (!collection) return { ok: false, message: "Collection not found." };

  if (member) {
    await db
      .insert(productCollections)
      .values({ productId, collectionId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(productCollections)
      .where(
        and(
          eq(productCollections.productId, productId),
          eq(productCollections.collectionId, collectionId),
        ),
      );
  }

  revalidateCatalog(productId);
  return {
    ok: true,
    message: member
      ? `Added to ${collection.name}.`
      : `Removed from ${collection.name}.`,
  };
}

/**
 * Reclassify products to the IP their own title names.
 *
 * Two thirds of this catalogue arrived with the supplier's shop name ("Y2CASE",
 * "JOYNOVA") in the brand column, and another 22 rows carry a blanket "Hello
 * Kitty" from an early classifier — on cases whose titles plainly say Miffy,
 * Tamagotchi or Monchhichi. In every one of those the correct answer is already
 * written on the product; it just was not in the field that filing reads.
 *
 * Applying it is safe by construction: the title is the corroboration, so the
 * result is a classification the audit will then rate as supported. It is
 * stamped with the operator marker because a human chose this selection and
 * pressed the button — which also lets the title contract treat the IP as
 * confirmed, and lets filing act authoritatively again.
 *
 * Products whose title names nothing in the registry are skipped, not guessed.
 */
export async function adoptTitleBrand(
  productIds: number[],
): Promise<{ ok: boolean; message: string; changed: number }> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized.", changed: 0 };
  }
  const ids = Array.from(new Set(productIds)).filter((n) => Number.isFinite(n));
  if (ids.length === 0) {
    return { ok: false, message: "No products selected.", changed: 0 };
  }

  const rows = await db.query.products.findMany({
    where: inArray(products.id, ids),
    columns: {
      id: true,
      title: true,
      brandName: true,
      characterName: true,
    },
  });

  let changed = 0;
  let noSignal = 0;
  let alreadyRight = 0;

  for (const row of rows) {
    const fromTitle = classifyBrandContext([row.title]);
    if (!fromTitle.brandId) {
      noSignal += 1;
      continue;
    }

    const current = resolveBrandAssignment(row.brandName, row.characterName);
    if (
      current.ok &&
      current.brand.id === fromTitle.brandId &&
      (current.character?.id ?? null) === fromTitle.characterId
    ) {
      alreadyRight += 1;
      continue;
    }

    const res = await updateProductBrand(
      row.id,
      fromTitle.brandId,
      fromTitle.characterId,
    );
    if (res.ok) changed += 1;
  }

  revalidateCatalog();
  const skipped = [
    noSignal > 0 ? `${noSignal} name no known IP` : null,
    alreadyRight > 0 ? `${alreadyRight} already correct` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    ok: true,
    message: changed
      ? `Reclassified ${changed} product${changed === 1 ? "" : "s"} from their titles.${skipped ? ` Skipped: ${skipped}.` : ""}`
      : `Nothing to change.${skipped ? ` ${skipped}.` : ""}`,
    changed,
  };
}

/**
 * Drop every brand collection a product's own classification and title fail to
 * support, for a whole selection.
 *
 * The counterpart to "Fix titles": filing can add a membership from evidence,
 * but it deliberately never removes one on a disputed classification, so
 * leftovers from an earlier, wrong classifier need an explicit instruction to
 * clear. Genre and feature memberships are curated by hand and are never
 * touched here.
 */
export async function purgeUnsupportedCollections(
  productIds: number[],
): Promise<{ ok: boolean; message: string; changed: number }> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized.", changed: 0 };
  }
  const ids = Array.from(new Set(productIds)).filter((n) => Number.isFinite(n));
  if (ids.length === 0) {
    return { ok: false, message: "No products selected.", changed: 0 };
  }

  const health = await auditCatalogClassification();
  const slugToId = new Map(
    (
      await db
        .select({ id: collections.id, slug: collections.slug })
        .from(collections)
    ).map((row) => [row.slug, row.id]),
  );

  let changed = 0;
  let removed = 0;
  for (const id of ids) {
    const unsupported = health.get(id)?.unsupportedSlugs ?? [];
    const collectionIds = unsupported
      .map((slug) => slugToId.get(slug))
      .filter((n): n is number => n !== undefined);
    if (collectionIds.length === 0) continue;

    await db
      .delete(productCollections)
      .where(
        and(
          eq(productCollections.productId, id),
          inArray(productCollections.collectionId, collectionIds),
        ),
      );
    changed += 1;
    removed += collectionIds.length;
  }

  revalidateCatalog();
  return {
    ok: true,
    message: changed
      ? `Removed ${removed} unsupported collection${removed === 1 ? "" : "s"} from ${changed} product${changed === 1 ? "" : "s"}.`
      : "Nothing to remove — every brand collection here is supported.",
    changed,
  };
}

/**
 * Rebuild many titles from product photos via vision AI.
 *
 * Unlike {@link bulkRepairTitles}, this always has work to do: even a
 * contract-clean title can be generic ("Clear Glitter Phone Case"), and the
 * operator selecting rows is asking for a fresh descriptive phrase under the
 * current brand. Brand is held fixed — the model only invents the descriptor.
 *
 * Sequential on purpose: each call spends a vision request, and firing them in
 * parallel would burn the rate limit for no latency win on a handful of rows.
 */
export async function bulkRewriteTitles(
  productIds: number[],
): Promise<{ ok: boolean; message: string; changed: number }> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized.", changed: 0 };
  }
  const ids = Array.from(new Set(productIds)).filter((n) => Number.isFinite(n));
  if (ids.length === 0) {
    return { ok: false, message: "No products selected.", changed: 0 };
  }

  let changed = 0;
  let vision = 0;
  let fallback = 0;
  let failed = 0;

  for (const id of ids) {
    try {
      const rewritten = await rewriteTitleKeepingBrand(id);
      if (!rewritten.ok || !rewritten.title) {
        failed += 1;
        continue;
      }
      const applied = await updateProductTitle(id, rewritten.title);
      if (!applied.ok || !applied.title) {
        failed += 1;
        continue;
      }
      // Skip a no-op write that somehow survived — still count as success only
      // when the stored title actually moved.
      changed += 1;
      if (rewritten.source === "vision") vision += 1;
      else fallback += 1;
    } catch {
      failed += 1;
    }
  }

  revalidateCatalog();

  if (changed === 0) {
    return {
      ok: failed === 0,
      message:
        failed > 0
          ? `Could not regenerate any of the ${ids.length} title${ids.length === 1 ? "" : "s"}.`
          : "Nothing to regenerate.",
      changed: 0,
    };
  }

  const parts = [
    `Regenerated ${changed} title${changed === 1 ? "" : "s"}`,
    vision > 0 ? `${vision} from photos` : null,
    fallback > 0 ? `${fallback} with the deterministic fallback` : null,
    failed > 0 ? `${failed} failed` : null,
  ].filter(Boolean);

  return { ok: true, message: `${parts.join(" · ")}.`, changed };
}

/**
 * Rebuild many titles from the products' own data, in one action.
 *
 * This is the deterministic repair, not the AI rewrite: it keeps each title's
 * prose and re-emits only the segments the contract owns — the character
 * prefix, the device coverage, the MagSafe suffix. That makes it safe to run
 * over a whole selection unattended, and free.
 *
 * Titles whose only fault is a brand the title itself contradicts are left
 * alone and counted separately. Repair cannot settle who is on the case; saying
 * so is more useful than silently rewriting around a classification that may be
 * the thing that's wrong.
 */
export async function bulkRepairTitles(
  productIds: number[],
): Promise<{ ok: boolean; message: string; changed: number }> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized.", changed: 0 };
  }
  const ids = Array.from(new Set(productIds)).filter((n) => Number.isFinite(n));
  if (ids.length === 0) {
    return { ok: false, message: "No products selected.", changed: 0 };
  }

  let changed = 0;
  let needsHuman = 0;

  for (const id of ids) {
    const state = await loadProductTitleState(id);
    if (!state) continue;

    const repaired = repairListingTitle(state.title, state.facts);
    if (!repaired.changed) {
      if (state.issues.length > 0) needsHuman += 1;
      continue;
    }

    await db
      .update(products)
      .set({ title: repaired.title, updatedAt: new Date() })
      .where(eq(products.id, id));
    // A title is the input to genre and feature filing, so a rename can move
    // the product. Re-file in the same pass or the browse tree goes stale.
    await refileProduct(id);
    changed += 1;
  }

  revalidateCatalog();
  const remainder =
    needsHuman > 0
      ? ` ${needsHuman} still need${needsHuman === 1 ? "s" : ""} a human — open the product and use “Rewrite with AI”.`
      : "";
  return {
    ok: true,
    message: changed
      ? `Rebuilt ${changed} title${changed === 1 ? "" : "s"} from product data.${remainder}`
      : `No title could be repaired automatically.${remainder}`,
    changed,
  };
}

/**
 * Dismiss a MagSafe review candidate — it's NOT MagSafe. Fully undo any MagSafe
 * classification (strip the appended title/description, drop the `magsafe` tag,
 * unlink the MagSafe collection) and clear the review flag.
 */
export async function dismissMagsafe(id: number) {
  if (!(await requireAdmin(await headers()))) return;
  const product = await db.query.products.findFirst({
    where: eq(products.id, id),
    columns: { id: true, title: true, description: true, tags: true },
  });
  if (!product) return;

  const stripped = removeMagSafeCopy({
    title: product.title,
    description: product.description,
    tags: product.tags,
  });
  await db
    .update(products)
    .set({
      title: stripped.title,
      description: stripped.description,
      tags: stripped.tags,
      needsMagsafeReview: false,
      updatedAt: new Date(),
    })
    .where(eq(products.id, id));

  const magCol = await db.query.collections.findFirst({
    where: eq(collections.slug, "magsafe"),
    columns: { id: true },
  });
  if (magCol) {
    await db
      .delete(productCollections)
      .where(
        and(
          eq(productCollections.productId, id),
          eq(productCollections.collectionId, magCol.id),
        ),
      );
  }
  revalidateCatalog(id);
}

export type BulkDeleteResult = {
  ok: boolean;
  message: string;
  deleted: number;
};

/**
 * Permanently delete many products at once. Child rows (images, options,
 * variants) cascade automatically; the underlying R2 media is cleaned up on a
 * best-effort basis so the bucket doesn't accumulate orphans.
 */
export async function bulkDeleteProducts(
  ids: number[],
): Promise<BulkDeleteResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized.", deleted: 0 };
  }
  const wanted = Array.from(new Set(ids)).filter((n) => Number.isFinite(n));
  if (wanted.length === 0) {
    return { ok: false, message: "No products selected.", deleted: 0 };
  }

  const deleted = await deleteProductsAndMedia(wanted);
  revalidateCatalog();

  return {
    ok: true,
    message: `Deleted ${deleted} product${deleted === 1 ? "" : "s"}.`,
    deleted,
  };
}

/**
 * Core delete: removes the product rows (children cascade) and then makes a
 * best-effort pass to purge their R2 media. R2 failures are logged but never
 * block the delete — an orphaned file is far less harmful than a half-deleted
 * catalog record, and orphans can be garbage-collected separately.
 */
async function deleteProductsAndMedia(ids: number[]): Promise<number> {
  const rows = await db.query.products.findMany({
    where: inArray(products.id, ids),
    columns: { id: true, videoUrl: true },
    with: { images: { columns: { url: true } } },
  });
  if (rows.length === 0) return 0;

  await db.delete(products).where(inArray(products.id, ids));

  try {
    const bucket = process.env.R2_BUCKET_NAME;
    if (bucket) {
      const keys: string[] = [];
      for (const row of rows) {
        for (const img of row.images) {
          const key = r2KeyFromUrl(img.url);
          if (key) keys.push(key);
        }
        if (row.videoUrl) {
          const key = r2KeyFromUrl(row.videoUrl);
          if (key) keys.push(key);
        }
      }
      if (keys.length > 0) {
        const r2 = makeR2Client();
        await deleteObjectsFromR2(r2, bucket, keys);
      }
    }
  } catch (err) {
    console.error(
      "[deleteProducts] R2 media cleanup failed (orphaned files left behind):",
      err instanceof Error ? err.message : err,
    );
  }

  return rows.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk variation editor
//
// Applies a Style add-on choice and/or an iPhone-model selection across many
// products in one transaction-like batch. Only iPhone-case products carry these
// axes, so other product types are silently skipped (and reported).
// ─────────────────────────────────────────────────────────────────────────────

/** How the operator chose the offered styles in the bulk editor. */
export type BulkStyleUpdate =
  | { mode: "addons"; hasGrip: boolean; hasCharm: boolean }
  | { mode: "manual"; styles: string[] };

export type BulkUpdatePayload = {
  productIds: number[];
  /** When present, overwrites each product's offered Style set + base price. */
  styles?: BulkStyleUpdate;
  /** When present, overwrites each product's offered iPhone Model set. */
  models?: string[];
  /** When present, publishes (active) or unpublishes (draft) the selection. */
  status?: "active" | "draft";
};

export type BulkUpdateResult = {
  ok: boolean;
  message: string;
  updated: number;
  skipped: number;
};

/** Resolve the canonical, price-ordered style set from the editor's choice. */
function resolveStyles(update: BulkStyleUpdate): string[] {
  if (update.mode === "addons") {
    return stylesForAddons({
      hasGrip: update.hasGrip,
      hasCharm: update.hasCharm,
    });
  }
  const cleaned = update.styles.filter((s) => VALID_STYLES.has(s));
  // "Case Only" is mandatory — every product ships with a bare case.
  const withCase = cleaned.includes("Case Only")
    ? cleaned
    : [...cleaned, "Case Only"];
  return orderStyles(withCase);
}

/** Insert or update a single named option axis for one product. */
async function upsertOption(
  productId: number,
  name: string,
  values: string[],
  existing: { id: number; name: string }[],
  positionFallback: number,
) {
  const match = existing.find((o) => o.name === name);
  if (match) {
    await db
      .update(productOptions)
      .set({ values })
      .where(eq(productOptions.id, match.id));
  } else {
    await db.insert(productOptions).values({
      productId,
      name,
      position: positionFallback,
      values,
    });
  }
}

export async function bulkUpdateProducts(
  payload: BulkUpdatePayload,
): Promise<BulkUpdateResult> {
  const session = await requireAdmin(await headers());
  if (!session) {
    return { ok: false, message: "Not authorized.", updated: 0, skipped: 0 };
  }

  const ids = Array.from(new Set(payload.productIds)).filter((n) =>
    Number.isFinite(n),
  );
  if (ids.length === 0) {
    return {
      ok: false,
      message: "No products selected.",
      updated: 0,
      skipped: 0,
    };
  }

  const wantsStyles = payload.styles != null;
  const wantsModels = payload.models != null;
  const wantsStatus = payload.status != null;
  if (!wantsStyles && !wantsModels && !wantsStatus) {
    return { ok: false, message: "Nothing to apply.", updated: 0, skipped: 0 };
  }

  // ── Validate the requested variation sets up front ────────────────────────
  const targetStyles = wantsStyles ? resolveStyles(payload.styles!) : null;
  const targetModels = wantsModels
    ? orderModels(payload.models!.filter((m) => VALID_MODELS.has(m)))
    : null;
  if (wantsModels && (!targetModels || targetModels.length === 0)) {
    return {
      ok: false,
      message: "Select at least one iPhone model.",
      updated: 0,
      skipped: 0,
    };
  }

  const rows = await db.query.products.findMany({
    where: inArray(products.id, ids),
    columns: { id: true, currency: true, productType: true },
    with: {
      images: { columns: { id: true, styleTags: true } },
      options: { columns: { id: true, name: true } },
    },
  });

  let updated = 0;
  let skipped = 0;

  for (const product of rows) {
    // Status changes apply to any product type.
    if (wantsStatus) {
      await db
        .update(products)
        .set({ status: payload.status!, updatedAt: new Date() })
        .where(eq(products.id, product.id));
    }

    // Style/model axes only exist on phone cases.
    const isIphoneCase = product.productType === "iphone_case";
    if ((wantsStyles || wantsModels) && !isIphoneCase) {
      skipped += 1;
      if (!wantsStatus) continue;
    }

    if (isIphoneCase && wantsStyles && targetStyles) {
      await upsertOption(
        product.id,
        STYLE_OPTION_NAME,
        targetStyles,
        product.options,
        product.options.length,
      );
      // Base "from" price follows the cheapest offered style.
      await db
        .update(products)
        .set({
          price: String(
            getStylePrice(defaultStyleFor(targetStyles), product.currency),
          ),
          updatedAt: new Date(),
        })
        .where(eq(products.id, product.id));
      // Re-point per-image tags at the new offered set. This also collapses any
      // image still carrying several tags, so applying styles in bulk repairs
      // legacy rows on the way past.
      await Promise.all(
        product.images
          .filter(
            (img) => !imageStyleTagsAreCanonical(img.styleTags, targetStyles),
          )
          .map((img) =>
            db
              .update(productImages)
              .set({
                styleTags: normalizeImageStyleTags(img.styleTags, targetStyles),
              })
              .where(eq(productImages.id, img.id)),
          ),
      );
    }

    if (isIphoneCase && wantsModels && targetModels) {
      await upsertOption(
        product.id,
        MODEL_OPTION_NAME,
        targetModels,
        product.options,
        product.options.length,
      );
    }

    updated += 1;
  }

  revalidateCatalog();

  const parts: string[] = [];
  if (wantsStatus)
    parts.push(payload.status === "active" ? "published" : "unpublished");
  if (wantsStyles) parts.push("styles");
  if (wantsModels) parts.push("models");
  const what = parts.join(" + ");
  const skipNote = skipped > 0 ? ` (${skipped} non-case skipped)` : "";

  return {
    ok: true,
    message: `Updated ${what} on ${updated} product${updated === 1 ? "" : "s"}${skipNote}.`,
    updated,
    skipped,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-product bulk workspace
//
// The "Edit individually" mode loads the full editable state for the selected
// products on demand (so the catalog list itself stays light), lets the
// operator curate each product's media order, per-image style tags, styles and
// models independently, then commits everything in one Save All.
// ─────────────────────────────────────────────────────────────────────────────

/** One image in the per-product editor. */
export type BulkEditImage = {
  id: number;
  url: string;
  filename: string | null;
  styleTags: string[];
};

/** Everything the per-product editor needs to render and edit one product. */
export type BulkEditProduct = {
  id: number;
  title: string;
  slug: string;
  status: string;
  productType: string;
  productTypeLabel: string;
  currency: string;
  videoUrl: string | null;
  videoPosition: number | null;
  images: BulkEditImage[];
  availableStyles: string[];
  availableModels: string[];
};

/** A single product's curated state, sent back to {@link bulkSaveProducts}. */
export type PerProductSave = {
  productId: number;
  imageOrder: number[];
  videoSlot: number | null;
  styleTags: Record<number, string[]>;
  availableStyles: string[];
  availableModels: string[];
};

export type BulkSaveResult = {
  ok: boolean;
  message: string;
  saved: number;
  failed: { productId: number; message: string }[];
};

/**
 * Load the full editable state for a set of products. Admin-guarded; returns
 * results in the same priority order the list uses (drafts feel "first").
 */
export async function getBulkEditProducts(
  ids: number[],
): Promise<BulkEditProduct[]> {
  const session = await requireAdmin(await headers());
  if (!session) return [];

  const wanted = Array.from(new Set(ids)).filter((n) => Number.isFinite(n));
  if (wanted.length === 0) return [];

  const rows = await db.query.products.findMany({
    where: inArray(products.id, wanted),
    columns: {
      id: true,
      title: true,
      slug: true,
      status: true,
      currency: true,
      productType: true,
      videoUrl: true,
      videoPosition: true,
    },
    with: {
      images: {
        columns: {
          id: true,
          url: true,
          sourceFilename: true,
          styleTags: true,
        },
        orderBy: (img, { asc }) => asc(img.position),
      },
      options: { columns: { name: true, values: true } },
    },
  });

  return rows.map((p): BulkEditProduct => {
    const styleOpt = p.options.find((o) => o.name === STYLE_OPTION_NAME);
    const modelOpt = p.options.find((o) => o.name === MODEL_OPTION_NAME);
    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      status: p.status,
      productType: p.productType,
      productTypeLabel: productTypeLabel(p.productType),
      currency: p.currency,
      videoUrl: p.videoUrl,
      videoPosition: p.videoPosition,
      images: p.images.map((i) => ({
        id: i.id,
        url: i.url,
        filename: i.sourceFilename,
        styleTags: i.styleTags ?? [],
      })),
      availableStyles: orderStyles(styleOpt?.values ?? []),
      availableModels: orderModels(modelOpt?.values ?? []),
    };
  });
}

/**
 * Commit per-product edits for many products in one call. Each product is
 * saved independently so one bad record can't roll back the rest; failures are
 * reported back to the UI. Caches are revalidated once at the end.
 */
export async function bulkSaveProducts(
  items: PerProductSave[],
): Promise<BulkSaveResult> {
  const session = await requireAdmin(await headers());
  if (!session) {
    return { ok: false, message: "Not authorized.", saved: 0, failed: [] };
  }
  if (items.length === 0) {
    return { ok: false, message: "No changes to save.", saved: 0, failed: [] };
  }

  let saved = 0;
  const failed: { productId: number; message: string }[] = [];

  for (const item of items) {
    try {
      const res = await saveProductVariations({
        productId: item.productId,
        imageOrder: item.imageOrder,
        videoSlot: item.videoSlot,
        styleTags: item.styleTags,
        availableStyles: item.availableStyles,
        availableModels: item.availableModels,
      });
      if (res.ok) saved += 1;
      else failed.push({ productId: item.productId, message: res.message });
    } catch (err) {
      failed.push({
        productId: item.productId,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  revalidateCatalog();

  const ok = failed.length === 0;
  const message = ok
    ? `Saved ${saved} product${saved === 1 ? "" : "s"}.`
    : `Saved ${saved}, ${failed.length} failed.`;
  return { ok, message, saved, failed };
}

// ── Thumbnail normalization review ──────────────────────────────────────────

export type ActionResult = { ok: boolean; message: string };

/**
 * Generate normalization proposals for the next batch of pending products in
 * `scope`. Bounded + synchronous so the admin can click, wait, and review the
 * results; each product is processed independently so one bad image can't abort
 * the run.
 *
 * `proposed` is what the client's "Generate all" loop watches: the candidate
 * pool only shrinks when a product yields a proposal (failures are re-flagged
 * and stay eligible), so a batch that proposes nothing means no further
 * progress is possible.
 */
export async function generateThumbnailProposals(
  limit = 5,
  scope: ThumbnailScope = DEFAULT_THUMBNAIL_SCOPE,
): Promise<ActionResult & { changed: number; proposed: number }> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized.", changed: 0, proposed: 0 };
  }
  try {
    const { processed, proposed, flagged } = await generateProposalsForPending(
      limit,
      parseThumbnailScope(scope),
    );
    revalidatePath("/admin/products/thumbnails");
    revalidatePath("/admin/products");
    return {
      ok: true,
      message:
        processed === 0
          ? "Nothing left to process — the queue is clear."
          : `Processed ${processed} · ${proposed} proposed · ${flagged} flagged.`,
      changed: processed,
      proposed,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Generation failed.",
      changed: 0,
      proposed: 0,
    };
  }
}

/** Approve a proposal — promotes the normalized image to the live thumbnail. */
export async function approveThumbnailProposal(
  productId: number,
): Promise<ActionResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized." };
  }
  const res = await approveProposal(productId);
  if (res.ok) {
    revalidateCatalog(productId);
    revalidatePath("/admin/products/thumbnails");
  }
  return res;
}

/** Flag (needs a better photo) or skip a proposal. */
export async function decideThumbnailProposal(
  productId: number,
  decision: "flagged" | "skipped",
): Promise<ActionResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized." };
  }
  const res = await setProposalDecision(productId, decision);
  if (res.ok) revalidatePath("/admin/products/thumbnails");
  return res;
}

/**
 * Generatively remove the hand/props from a product's photo and rebuild the
 * proposal on plain white. Used for products with no clean, hand-free shot.
 */
export async function aiCleanupThumbnail(
  productId: number,
): Promise<ActionResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized." };
  }
  try {
    const res = await regenerateProposalWithAiCleanup(productId);
    if (res.ok) revalidatePath("/admin/products/thumbnails");
    return res;
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "AI cleanup failed.",
    };
  }
}

/** Dedicated cleanup for the recurring top-left physical tag artifact. */
export async function aiRemoveThumbnailArtifact(
  productId: number,
): Promise<ActionResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized." };
  }
  try {
    const res = await regenerateProposalWithAiCleanup(productId, "artifact");
    if (res.ok) revalidatePath("/admin/products/thumbnails");
    return res;
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Tag removal failed.",
    };
  }
}

/** Remove the background of a proposal (segmentation) and re-center on white. */
export async function removeThumbnailBackground(
  productId: number,
): Promise<ActionResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized." };
  }
  try {
    const res = await removeBackgroundProposal(productId);
    if (res.ok) revalidatePath("/admin/products/thumbnails");
    return res;
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Background removal failed.",
    };
  }
}

/** Re-crop a proposal to the selected region and re-center it on white. */
export async function adjustThumbnailCrop(
  productId: number,
  rect: CropRect,
): Promise<ActionResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized." };
  }
  try {
    const res = await recropProposal(productId, rect);
    if (res.ok) revalidatePath("/admin/products/thumbnails");
    return res;
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Adjust failed.",
    };
  }
}

export type BulkResult = ActionResult & { processed: number };

/** Approve a set of proposals (non-proposed ids are skipped). */
export async function bulkApproveThumbnails(
  ids: number[],
): Promise<BulkResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized.", processed: 0 };
  }
  const { processed } = await approveProposals(ids);
  if (processed > 0) {
    revalidateCatalog();
    revalidatePath("/admin/products/thumbnails");
  }
  return { ok: true, processed, message: `Approved ${processed}.` };
}

/** Flag or skip a set of proposals. */
export async function bulkDecideThumbnails(
  ids: number[],
  decision: "flagged" | "skipped",
): Promise<BulkResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized.", processed: 0 };
  }
  const { processed } = await decideProposals(ids, decision);
  if (processed > 0) revalidatePath("/admin/products/thumbnails");
  return { ok: true, processed, message: `Updated ${processed}.` };
}

/** Regenerate a set of products in parallel (bounded server-side). */
export async function bulkRegenerateThumbnails(
  ids: number[],
): Promise<BulkResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized.", processed: 0 };
  }
  try {
    const { processed } = await regenerateProposalsWithAiCleanup(ids);
    revalidatePath("/admin/products/thumbnails");
    return { ok: true, processed, message: `Regenerated ${processed}.` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Bulk regenerate failed.",
      processed: 0,
    };
  }
}

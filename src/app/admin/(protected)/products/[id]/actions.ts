"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { revalidateStorefrontCatalog } from "@/lib/cache";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import {
  saveProductVariations,
  type SaveVariationsResult,
} from "@/lib/admin/product-variations";
import { classifyCharacterBrand, visionBrandIsAuthoritative } from "@/lib/ai";
import {
  classifyBrandContext,
  resolveBrandAssignment,
  OPERATOR_EVIDENCE_PREFIX,
  type BrandConfidence,
} from "@/lib/catalog/brands";
import { applyBrandAssignment } from "@/lib/catalog/brand-assignment";
import { refileProduct, type RefileResult } from "@/lib/catalog/collection-filing";
import { findForbiddenScript } from "@/lib/catalog/copy-schema";
import {
  COLOR_FAMILIES,
  classifyProductColors,
  mergeColorClassifications,
  parseColorFamilies,
  type ColorFamilySlug,
} from "@/lib/catalog/colors";
import {
  MOTIF_FAMILIES,
  classifyProductMotifs,
  parseMotifFamilies,
  type MotifFamilySlug,
} from "@/lib/catalog/motifs";
import { extractColorsFromImageUrl } from "@/lib/catalog/color-extract";
import {
  LISTING_TITLE_MAX,
  LISTING_TITLE_MIN,
} from "@/lib/catalog/listing-title";
import {
  proposeListingTitle,
  type TitleProposalMode,
  type TitleProposalResult,
} from "@/lib/catalog/listing-title-service";

export type SaveProductPayload = {
  productId: number;
  /** Image ids in their new display order (top → bottom). */
  imageOrder: number[];
  /** 0-based slot the video occupies among the images. Null = no video slot. */
  videoSlot: number | null;
  /** imageId → applicable styles. `[]` means universal (shown for every style). */
  styleTags: Record<number, string[]>;
  /** The styles this product offers (drives the Style option + price). */
  availableStyles: string[];
  /** The iPhone models this product is sold for (optional; omit to keep). */
  availableModels?: string[];
};
export type SaveResult = SaveVariationsResult;

/** Re-prime every surface a product-level edit can affect. */
function revalidateProduct(productId: number) {
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products");
  revalidatePath("/products");
  // The PDP is ISR-cached (`export const revalidate`). Without invalidating the
  // dynamic route, edits stay stale for up to an hour.
  revalidatePath("/products/[slug]", "page");
  revalidatePath("/");
  revalidateStorefrontCatalog();
}

/**
 * Persist a curated media order, per-image style tags, the video slot and the
 * product's available styles/models in one shot. The heavy lifting lives in
 * the shared {@link saveProductVariations} core so this path stays identical
 * to the bulk editor.
 */
export async function saveProduct(
  payload: SaveProductPayload,
): Promise<SaveResult> {
  const session = await requireAdmin(await headers());
  if (!session) return { ok: false, message: "Not authorized." };

  const result = await saveProductVariations(payload);
  revalidateProduct(payload.productId);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Listing title
// ─────────────────────────────────────────────────────────────────────────────

export type TitleUpdateResult = {
  ok: boolean;
  message: string;
  title: string | null;
  /**
   * The brand the new title reads as, when it disagrees with what's stored.
   * The operator usually retitles *because* the classification was wrong, so
   * we hand them the follow-up instead of making them notice it.
   */
  brandHint: string | null;
};

/** Reject a title before it can reach the storefront, the feeds or an email. */
function validateTitle(rawTitle: string): { title: string } | { error: string } {
  const title = rawTitle.replace(/\s+/g, " ").trim();
  if (title.length < LISTING_TITLE_MIN) {
    return { error: `Title must be at least ${LISTING_TITLE_MIN} characters.` };
  }
  if (title.length > LISTING_TITLE_MAX) {
    return {
      error: `Title must be ${LISTING_TITLE_MAX} characters or fewer (currently ${title.length}).`,
    };
  }
  const forbidden = findForbiddenScript(title);
  if (forbidden) {
    return {
      error: `Title contains ${forbidden} characters — storefront copy is English-only.`,
    };
  }
  return { title };
}

/**
 * Rename a listing.
 *
 * The slug is deliberately left alone: it is the product's public URL and its
 * key in every index we have already submitted, so renaming must not break
 * links.
 *
 * The write is followed by a re-file. Collection membership was historically
 * decided once, at ingest, from the title of the day — so correcting a title
 * from "Mint Green Kawaii Bear" to "Rilakkuma …" made the listing findable
 * while leaving it filed exactly where the wrong title had put it. Re-deriving
 * membership on every title write closes that loop by construction.
 */
export async function updateProductTitle(
  productId: number,
  rawTitle: string,
): Promise<TitleUpdateResult> {
  const session = await requireAdmin(await headers());
  if (!session) {
    return { ok: false, message: "Not authorized.", title: null, brandHint: null };
  }

  const validated = validateTitle(rawTitle);
  if ("error" in validated) {
    return { ok: false, message: validated.error, title: null, brandHint: null };
  }
  const { title } = validated;

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: {
      id: true,
      title: true,
      brandName: true,
      characterName: true,
      sourceFolder: true,
      motifsLocked: true,
    },
  });
  if (!product) {
    return { ok: false, message: "Product not found.", title: null, brandHint: null };
  }
  if (product.title === title) {
    return { ok: true, message: "No change.", title, brandHint: null };
  }

  // Title is the honest motif signal. An unlocked row follows the new copy so
  // a retitle from "Rainy Cloud" to "Pastel Bow" cannot leave Clouds on the
  // Theme facet. Locked rows stay as the operator last saved them.
  await db
    .update(products)
    .set({
      title,
      updatedAt: new Date(),
      ...(product.motifsLocked
        ? {}
        : {
            motifs: classifyProductMotifs({
              title,
              sourceFolder: product.sourceFolder,
            }),
          }),
    })
    .where(eq(products.id, productId));

  const filing = await refileProduct(productId);
  revalidateBrandSurfaces(productId);

  const fromTitle = classifyBrandContext([title]);
  const current = resolveBrandAssignment(
    product.brandName,
    product.characterName,
  );
  const currentCharacterId = current.ok ? (current.character?.id ?? null) : null;
  const currentBrandId = current.ok ? current.brand.id : null;
  const disagrees =
    fromTitle.brandId != null &&
    (fromTitle.brandId !== currentBrandId ||
      (fromTitle.characterId != null &&
        fromTitle.characterId !== currentCharacterId));

  return {
    ok: true,
    message: `Title updated.${describeFiling(filing)}`,
    title,
    brandHint: disagrees ? (fromTitle.character ?? fromTitle.brand) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AI-assisted retitling
// ─────────────────────────────────────────────────────────────────────────────

// Re-exported so the client panel can type the response without importing a
// module that reaches for the database.
export type {
  TitleProposal,
  TitleProposalMode,
  TitleProposalResult,
} from "@/lib/catalog/listing-title-service";

/**
 * Propose a corrected title. Writes nothing — the operator reviews first.
 *
 * `repair` is deterministic and free: it keeps the existing prose and re-emits
 * only the segments the title contract owns (the character prefix, the device
 * coverage derived from the product's real variant matrix, the verified MagSafe
 * suffix). `rewrite` spends a vision call for a fresh descriptive phrase, and
 * re-reads the brand from the photos while it is looking at them.
 */
export async function regenerateListingTitle(
  productId: number,
  mode: TitleProposalMode,
): Promise<TitleProposalResult> {
  if (!(await requireAdmin(await headers()))) {
    return { ok: false, message: "Not authorized.", proposal: null };
  }
  try {
    return await proposeListingTitle(productId, mode);
  } catch (err) {
    return {
      ok: false,
      message: `Could not build a proposal — ${err instanceof Error ? err.message : String(err)}`,
      proposal: null,
    };
  }
}

/**
 * Commit a proposal: the title, the brand reassignment it depends on, and the
 * re-file, in one call.
 *
 * Done as a single action on purpose. A proposal whose title says "Rilakkuma"
 * is only correct if the product is also *classified* as Rilakkuma; committing
 * the two separately leaves a window — and, if the second call fails, a durable
 * state — where the storefront copy and the browse tree disagree.
 */
export async function applyTitleProposal(
  productId: number,
  title: string,
  brand: { brandId: string; characterId: string | null } | null,
): Promise<TitleUpdateResult> {
  const session = await requireAdmin(await headers());
  if (!session) {
    return { ok: false, message: "Not authorized.", title: null, brandHint: null };
  }

  const validated = validateTitle(title);
  if ("error" in validated) {
    return { ok: false, message: validated.error, title: null, brandHint: null };
  }

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { id: true },
  });
  if (!product) {
    return { ok: false, message: "Product not found.", title: null, brandHint: null };
  }

  // Brand first: the title's IP prefix is only truthful once the classification
  // agrees with it, and the re-file below reads the brand columns.
  let brandNote = "";
  if (brand) {
    const resolved = resolveBrandAssignment(brand.brandId, brand.characterId);
    if (!resolved.ok) {
      return {
        ok: false,
        message: resolved.reason,
        title: null,
        brandHint: null,
      };
    }
    await applyBrandAssignment(productId, {
      brandId: resolved.brand.id,
      brandName: resolved.brand.brand,
      characterId: resolved.character?.id ?? null,
      characterName: resolved.character?.name ?? null,
      confidence: "high",
      evidence: [
        `title proposal accepted by ${session.user?.email ?? "admin"}`,
      ],
    });
    brandNote = ` Reassigned to ${resolved.character?.name ?? resolved.brand.brand}.`;
  }

  await db
    .update(products)
    .set({ title: validated.title, updatedAt: new Date() })
    .where(eq(products.id, productId));

  const filing = await refileProduct(productId);
  revalidateBrandSurfaces(productId);

  return {
    ok: true,
    message: `Title updated.${brandNote}${describeFiling(filing)}`,
    title: validated.title,
    brandHint: null,
  };
}

/**
 * Why brand collections were left alone. Said out loud, because "we did not
 * move this product" and "this product was already in the right place" look
 * identical from the outside and mean very different things.
 */
const HELD_REASON: Record<NonNullable<RefileResult["held"]>, string> = {
  brand_conflict:
    "Brand collections left as they were: the title and the brand field name different characters. Settle that first.",
  brand_unverified:
    "Brand collections left as they were: nothing in this product's own copy corroborates its brand field.",
  brand_unresolved:
    "Brand collections left as they were: the stored brand isn't a known registry entry.",
};

/** One sentence about what the re-file moved, or nothing when it was a no-op. */
function describeFiling(filing: RefileResult): string {
  const parts: string[] = [];
  if (filing.added.length > 0) parts.push(`Filed under ${filing.added.join(", ")}.`);
  if (filing.removed.length > 0) {
    parts.push(`Removed from ${filing.removed.join(", ")}.`);
  }
  if (filing.unseeded.length > 0) {
    parts.push(
      `${filing.unseeded.join(", ")} ${filing.unseeded.length === 1 ? "is" : "are"} not in the database yet — run a taxonomy sync from the products console.`,
    );
  }
  if (filing.held) parts.push(HELD_REASON[filing.held]);
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand / character reassignment
//
// The classifier is AI-assisted at ingest, but the operator is the final
// authority. Two paths exist and both end at the same write:
//
//   1. Re-detect — merge a fresh vision read of the stored photos with the
//      text signals in the title/folder, and *propose* a verdict.
//   2. Override  — the operator picks a brand + character from the registry.
//
// Every value crossing this boundary is resolved against the brand registry
// before it touches the database, so `products.brand_name` can only ever hold a
// canonical name, and collection membership is reconciled in the same call.
//
// NOTE: This is a "use server" module — every export MUST be an async function.
// The selectable brand list is passed to the client from the page's server
// component (see `listBrandOptions`), not exported from here.
// ─────────────────────────────────────────────────────────────────────────────

/** A proposed classification the operator can accept, edit or ignore. */
export type BrandSuggestion = {
  brandId: string;
  brandName: string;
  characterId: string | null;
  characterName: string | null;
  confidence: BrandConfidence;
  evidence: string[];
  /** Which signal produced the verdict — shown so the operator can judge it. */
  source: "vision" | "text";
};

export type BrandDetectionResult = {
  ok: boolean;
  message: string;
  suggestion: BrandSuggestion | null;
};

export type BrandUpdateResult = {
  ok: boolean;
  message: string;
  brand: string | null;
  character: string | null;
  confidence: BrandConfidence | null;
  evidence: string[];
};

/** Images sent to the classifier — enough angles to recognise a character. */
const DETECT_IMAGE_LIMIT = 8;

/**
 * Re-run brand detection for one product and return a proposal WITHOUT writing
 * it. The vision verdict wins at medium confidence or better; otherwise the
 * deterministic read of the title/source folder is offered instead. Nothing is
 * persisted until the operator commits via {@link updateProductBrand}.
 */
export async function reclassifyBrandFromVision(
  productId: number,
): Promise<BrandDetectionResult> {
  const session = await requireAdmin(await headers());
  if (!session) {
    return { ok: false, message: "Not authorized.", suggestion: null };
  }

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { id: true, title: true, sourceFolder: true },
    with: {
      images: {
        columns: { url: true, position: true },
        orderBy: (img, { asc }) => asc(img.position),
        limit: DETECT_IMAGE_LIMIT,
      },
    },
  });
  if (!product) {
    return { ok: false, message: "Product not found.", suggestion: null };
  }

  const imageUrls = product.images.map((img) => img.url);
  if (imageUrls.length === 0) {
    return {
      ok: false,
      message: "No photos to classify — add images first.",
      suggestion: null,
    };
  }

  const fromText = classifyBrandContext([product.title, product.sourceFolder]);
  // The classifier never throws (an outage must not break ingest), so its
  // diagnostics are the only way to tell "no brand in these photos" apart from
  // "the model is unreachable". The operator deserves to know which it was.
  const diagnostics: string[] = [];
  const fromVision = await classifyCharacterBrand(imageUrls, (msg) =>
    diagnostics.push(msg),
  );
  const visionFailed = diagnostics.some((msg) => msg.includes("failed"));

  // The photos win when they're read confidently; the title is the fallback,
  // never a tiebreaker that can override a confident look at the product.
  const useVision =
    visionBrandIsAuthoritative(fromVision) || fromText.brandId == null;
  const winner = useVision ? fromVision : fromText;
  const source: BrandSuggestion["source"] = useVision ? "vision" : "text";

  if (!winner.brandId || !winner.brand) {
    return {
      ok: !visionFailed,
      message: visionFailed
        ? `Vision classifier unavailable — ${diagnostics[diagnostics.length - 1]}`
        : "Neither the photos nor the title matched a brand in the registry — pick one manually.",
      suggestion: null,
    };
  }

  return {
    ok: true,
    message:
      source === "vision"
        ? `Photos read as ${winner.brand}${winner.character ? ` · ${winner.character}` : ""} (${winner.confidence} confidence).`
        : `Photos were inconclusive — the title reads as ${winner.brand}${winner.character ? ` · ${winner.character}` : ""}.`,
    suggestion: {
      brandId: winner.brandId,
      brandName: winner.brand,
      characterId: winner.characterId,
      characterName: winner.character,
      confidence: winner.confidence,
      evidence: winner.evidence,
      source,
    },
  };
}

/**
 * Commit a brand/character assignment.
 *
 * The operator's choice is authoritative, so it is stamped "high" and the
 * evidence records who made the call. Brand and character collections are
 * reconciled in the same call, and any collection the taxonomy defines but the
 * database hasn't been given yet is reported back rather than silently dropped.
 *
 * Pass `brandId: null` to clear the classification.
 */
export async function updateProductBrand(
  productId: number,
  brandId: string | null,
  characterId: string | null,
): Promise<BrandUpdateResult> {
  const session = await requireAdmin(await headers());
  if (!session) {
    return {
      ok: false,
      message: "Not authorized.",
      brand: null,
      character: null,
      confidence: null,
      evidence: [],
    };
  }

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { id: true },
  });
  if (!product) {
    return {
      ok: false,
      message: "Product not found.",
      brand: null,
      character: null,
      confidence: null,
      evidence: [],
    };
  }

  if (!brandId) {
    await applyBrandAssignment(productId, {
      brandId: null,
      brandName: null,
      characterId: null,
      characterName: null,
      confidence: "none",
      evidence: [],
    });
    revalidateBrandSurfaces(productId);
    return {
      ok: true,
      message: "Brand cleared.",
      brand: null,
      character: null,
      confidence: "none",
      evidence: [],
    };
  }

  const resolved = resolveBrandAssignment(brandId, characterId);
  if (!resolved.ok) {
    return {
      ok: false,
      message: resolved.reason,
      brand: null,
      character: null,
      confidence: null,
      evidence: [],
    };
  }

  const by = session.user?.email ?? "admin";
  const evidence = [
    `${OPERATOR_EVIDENCE_PREFIX} by ${by}`,
    ...(resolved.character ? [resolved.character.name] : []),
  ];

  const sync = await applyBrandAssignment(productId, {
    brandId: resolved.brand.id,
    brandName: resolved.brand.brand,
    characterId: resolved.character?.id ?? null,
    characterName: resolved.character?.name ?? null,
    confidence: "high",
    evidence,
  });

  revalidateBrandSurfaces(productId);

  const label = `${resolved.brand.brand}${resolved.character ? ` · ${resolved.character.name}` : ""}`;
  const collectionNote =
    sync.unseeded.length > 0
      ? ` Collection${sync.unseeded.length === 1 ? "" : "s"} ${sync.unseeded.join(", ")} not in the database yet — run a taxonomy sync from the products console.`
      : sync.linked.length > 0
        ? ` Filed under ${sync.linked.join(", ")}.`
        : "";

  return {
    ok: true,
    message: `Set to ${label}.${collectionNote}`,
    brand: resolved.brand.brand,
    character: resolved.character?.name ?? null,
    confidence: "high",
    evidence,
  };
}

/** Brand edits move products between collections, so the browse tree changes. */
function revalidateBrandSurfaces(productId: number) {
  revalidateProduct(productId);
  revalidatePath("/collections");
  revalidatePath("/collections/[slug]", "page");
}

// ─────────────────────────────────────────────────────────────────────────────
// Color facet
// ─────────────────────────────────────────────────────────────────────────────

export type ColorSaveResult = {
  ok: boolean;
  message: string;
  colors: ColorFamilySlug[];
};

export type ColorDetectResult = {
  ok: boolean;
  message: string;
  colors: ColorFamilySlug[];
};

/**
 * Persist the operator's color families and lock them so a later backfill
 * cannot undo a human decision.
 */
export async function saveProductColors(
  productId: number,
  rawColors: string[],
): Promise<ColorSaveResult> {
  const session = await requireAdmin(await headers());
  if (!session) {
    return { ok: false, message: "Not authorized.", colors: [] };
  }

  const colors = parseColorFamilies(rawColors);
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { id: true },
  });
  if (!product) return { ok: false, message: "Product not found.", colors: [] };

  await db
    .update(products)
    .set({
      colors,
      colorsLocked: true,
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId));

  revalidateProduct(productId);
  return {
    ok: true,
    message:
      colors.length > 0
        ? `Saved ${colors.length} color${colors.length === 1 ? "" : "s"}.`
        : "Cleared colors.",
    colors,
  };
}

/**
 * Re-read the listing (title, folder, hero photo) and propose families.
 * Does not write — the operator confirms through {@link saveProductColors}.
 */
export async function detectProductColors(
  productId: number,
): Promise<ColorDetectResult> {
  const session = await requireAdmin(await headers());
  if (!session) {
    return { ok: false, message: "Not authorized.", colors: [] };
  }

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: {
      title: true,
      description: true,
      tags: true,
      materials: true,
      sourceFolder: true,
    },
    with: {
      images: {
        columns: { url: true, position: true },
        orderBy: (img, { asc }) => asc(img.position),
        limit: 1,
      },
    },
  });
  if (!product) return { ok: false, message: "Product not found.", colors: [] };

  const text = classifyProductColors({
    title: product.title,
    description: product.description,
    tags: product.tags,
    materials: product.materials,
    sourceFolder: product.sourceFolder,
  });
  const pixels = product.images[0]?.url
    ? await extractColorsFromImageUrl(product.images[0].url)
    : [];
  const colors = mergeColorClassifications(text, pixels);

  return {
    ok: true,
    message:
      colors.length > 0
        ? `Detected ${colors.map((slug) => COLOR_FAMILIES.find((f) => f.slug === slug)?.label ?? slug).join(", ")}.`
        : "No color signal in the title, folder or hero photo.",
    colors,
  };
}

export type MotifSaveResult = {
  ok: boolean;
  message: string;
  motifs: MotifFamilySlug[];
};

export type MotifDetectResult = {
  ok: boolean;
  message: string;
  motifs: MotifFamilySlug[];
};

export async function saveProductMotifs(
  productId: number,
  rawMotifs: string[],
): Promise<MotifSaveResult> {
  const session = await requireAdmin(await headers());
  if (!session) {
    return { ok: false, message: "Not authorized.", motifs: [] };
  }

  const motifs = parseMotifFamilies(rawMotifs);
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { id: true },
  });
  if (!product) return { ok: false, message: "Product not found.", motifs: [] };

  await db
    .update(products)
    .set({
      motifs,
      motifsLocked: true,
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId));

  revalidateProduct(productId);
  return {
    ok: true,
    message:
      motifs.length > 0
        ? `Saved ${motifs.length} theme${motifs.length === 1 ? "" : "s"}.`
        : "Cleared themes.",
    motifs,
  };
}

export async function detectProductMotifs(
  productId: number,
): Promise<MotifDetectResult> {
  const session = await requireAdmin(await headers());
  if (!session) {
    return { ok: false, message: "Not authorized.", motifs: [] };
  }

  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: {
      title: true,
      description: true,
      tags: true,
      sourceFolder: true,
    },
  });
  if (!product) return { ok: false, message: "Product not found.", motifs: [] };

  const motifs = classifyProductMotifs({
    title: product.title,
    description: product.description,
    tags: product.tags,
    sourceFolder: product.sourceFolder,
  });

  return {
    ok: true,
    message:
      motifs.length > 0
        ? `Detected ${motifs.map((slug) => MOTIF_FAMILIES.find((f) => f.slug === slug)?.label ?? slug).join(", ")}.`
        : "No theme signal in the title or folder.",
    motifs,
  };
}

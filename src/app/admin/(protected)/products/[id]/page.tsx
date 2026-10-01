import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getProductForAdmin } from "@/lib/products";
import { getThumbnailProposalForProduct } from "@/lib/admin/thumbnails";
import { isDbConfigured } from "@/lib/db";
import {
  offeredCompatibilityValues,
  offeredPriceValues,
} from "@/lib/catalog/offered-options";
import { listBrandOptions, resolveBrandAssignment } from "@/lib/catalog/brands";
import { currentCollectionSlugs } from "@/lib/catalog/collection-filing";
import { loadProductTitleState } from "@/lib/catalog/listing-title-service";
import { ProductEditor } from "./ProductEditor";
import type { BrandState } from "./BrandReassignmentCard";
import { isColorFamilySlug } from "@/lib/catalog/colors";
import { isMotifFamilySlug } from "@/lib/catalog/motifs";
import { MAGNETIC_RING_TAG } from "@/lib/catalog/magnetic-ring";
import { hydrateCustomStyles } from "@/lib/catalog/custom-styles";

export const metadata: Metadata = { title: "Admin · Edit product" };
export const dynamic = "force-dynamic";
/**
 * Style detection reads every photo, and thumbnail rebuilds call the image
 * model. Both run as server actions from this page, so they share its limit.
 */
export const maxDuration = 300;

export default async function AdminProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const productId = Number(id);

  if (!isDbConfigured() || !Number.isFinite(productId)) notFound();

  const [product, titleState, filedIn, thumbnailProposal] = await Promise.all([
    getProductForAdmin(productId),
    loadProductTitleState(productId),
    currentCollectionSlugs(productId),
    getThumbnailProposalForProduct(productId),
  ]);
  if (!product) notFound();

  const listingImage = product.images[0] ?? null;

  const brand = resolveStoredBrand(
    product.brandName,
    product.characterName,
    product.brandConfidence,
    product.brandEvidence,
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Link
        href="/admin/products"
        className="mb-6 inline-flex items-center gap-1 text-sm font-semibold text-[var(--foreground)]/60 hover:text-[var(--primary)]"
      >
        <ChevronLeft className="h-4 w-4" /> All products
      </Link>

      <ProductEditor
        productId={product.id}
        title={product.title}
        titleIssues={titleState?.issues ?? []}
        slug={product.slug}
        status={product.status}
        productType={product.productType}
        currency={product.currency}
        videoUrl={product.videoUrl}
        videoPosition={product.videoPosition}
        brand={brand}
        brandOptions={listBrandOptions()}
        filedIn={filedIn}
        images={product.images.map((i) => ({
          id: i.id,
          url: i.url,
          filename: i.sourceFilename,
          styleTags: i.styleTags ?? [],
        }))}
        availableStyles={offeredPriceValues(
          product.productType,
          product.options,
        )}
        availableModels={offeredCompatibilityValues(
          product.productType,
          product.options,
        )}
        containsMultipleProducts={product.containsMultipleProducts}
        customStyles={hydrateCustomStyles(
          product.customStyles,
          product.images,
          product.productType,
        )}
        initialStylePrices={product.stylePrices}
        colors={(product.colors ?? []).filter(isColorFamilySlug)}
        colorsLocked={product.colorsLocked}
        motifs={(product.motifs ?? []).filter(isMotifFamilySlug)}
        motifsLocked={product.motifsLocked}
        thumbnail={{
          currentUrl: listingImage?.url ?? null,
          currentFilename: listingImage?.sourceFilename ?? null,
          proposal: thumbnailProposal,
        }}
        hasMagneticRing={(product.tags ?? []).includes(MAGNETIC_RING_TAG)}
      />
    </div>
  );
}

/**
 * Project the stored brand columns onto the registry.
 *
 * Rows written by older classifiers can hold a character in the brand column
 * ("Hello Kitty") or a lowercased character name, so the picker is driven by
 * resolved registry ids rather than the raw strings. A value that no longer
 * resolves is passed through as `unresolved` so the card can say so instead of
 * quietly rendering an empty selection.
 */
function resolveStoredBrand(
  brandName: string | null,
  characterName: string | null,
  confidence: string | null,
  evidence: string[] | null,
): BrandState {
  const base = {
    confidence: confidence ?? null,
    evidence: evidence ?? [],
  };
  if (!brandName && !characterName) {
    return {
      ...base,
      brandId: null,
      brandName: null,
      characterId: null,
      characterName: null,
      unresolved: null,
    };
  }

  const resolved = resolveBrandAssignment(brandName, characterName);
  if (!resolved.ok) {
    // Retry without the character: a bad character shouldn't hide a good brand.
    const brandOnly = resolveBrandAssignment(brandName, null);
    if (!brandOnly.ok) {
      return {
        ...base,
        brandId: null,
        brandName: null,
        characterId: null,
        characterName: null,
        unresolved: [brandName, characterName].filter(Boolean).join(" / "),
      };
    }
    return {
      ...base,
      brandId: brandOnly.brand.id,
      brandName: brandOnly.brand.brand,
      characterId: null,
      characterName: null,
      unresolved: characterName,
    };
  }

  return {
    ...base,
    brandId: resolved.brand.id,
    brandName: resolved.brand.brand,
    characterId: resolved.character?.id ?? null,
    characterName: resolved.character?.name ?? null,
    unresolved: null,
  };
}

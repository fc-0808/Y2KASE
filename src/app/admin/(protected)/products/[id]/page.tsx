import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getProductForAdmin } from "@/lib/products";
import { isDbConfigured } from "@/lib/db";
import { STYLE_OPTION_NAME } from "@/lib/pricing";
import { listBrandOptions, resolveBrandAssignment } from "@/lib/catalog/brands";
import { currentCollectionSlugs } from "@/lib/catalog/collection-filing";
import { loadProductTitleState } from "@/lib/catalog/listing-title-service";
import { ProductEditor } from "./ProductEditor";
import type { BrandState } from "./BrandReassignmentCard";

export const metadata: Metadata = { title: "Admin · Edit product" };
export const dynamic = "force-dynamic";

export default async function AdminProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const productId = Number(id);

  if (!isDbConfigured() || !Number.isFinite(productId)) notFound();

  const [product, titleState, filedIn] = await Promise.all([
    getProductForAdmin(productId),
    loadProductTitleState(productId),
    currentCollectionSlugs(productId),
  ]);
  if (!product) notFound();

  const styleOption = product.options.find((o) => o.name === STYLE_OPTION_NAME);
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
        isIphoneCase={product.productType === "iphone_case"}
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
        availableStyles={styleOption?.values ?? []}
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

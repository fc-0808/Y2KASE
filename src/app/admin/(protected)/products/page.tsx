import type { Metadata } from "next";
import { eq, sql } from "drizzle-orm";
import { getAdminProductOverviews } from "@/lib/products";
import { getAdminCollectionOptions } from "@/lib/collections";
import { db, isDbConfigured } from "@/lib/db";
import { products as productsTable, thumbnailProposals } from "@/lib/db/schema";
import { diffCollectionTaxonomy } from "@/lib/catalog/taxonomy-sync";
import { auditCatalogTitles } from "@/lib/catalog/listing-title-service";
import { auditCatalogClassification } from "@/lib/catalog/classification-health-service";
import { listBrandOptions } from "@/lib/catalog/brands";
import { ProductsConsole } from "./ProductsConsole";

export const metadata: Metadata = { title: "Admin · Products" };
export const dynamic = "force-dynamic";
/** Bulk "Detect styles" reads every photo on the active listing. */
export const maxDuration = 180;

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ collection?: string }>;
}) {
  const sp = await searchParams;
  const initialCollectionId = sp.collection ? Number(sp.collection) : undefined;
  if (!isDbConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Database not configured</h1>
        <p className="mt-2 text-[var(--foreground)]/60">
          Add <code>DATABASE_URL</code> to <code>.env.local</code> to use the
          admin panel.
        </p>
      </div>
    );
  }

  const [
    products,
    collectionOptions,
    magsafeReview,
    thumbnailReview,
    taxonomyDrift,
    titleHealth,
    classification,
  ] = await Promise.all([
    getAdminProductOverviews(),
    getAdminCollectionOptions(),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(productsTable)
      .where(eq(productsTable.needsMagsafeReview, true)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(thumbnailProposals)
      .where(eq(thumbnailProposals.status, "proposed")),
    diffCollectionTaxonomy(),
    auditCatalogTitles(),
    auditCatalogClassification(),
  ]);

  return (
    <ProductsConsole
      products={products}
      collectionOptions={collectionOptions}
      initialCollectionId={initialCollectionId}
      magsafeReviewCount={magsafeReview[0]?.count ?? 0}
      thumbnailReviewCount={thumbnailReview[0]?.count ?? 0}
      missingCollections={taxonomyDrift.missing}
      // A Map can't cross the server/client boundary, so it goes as an object.
      titleHealth={Object.fromEntries(titleHealth)}
      classification={Object.fromEntries(classification)}
      brandOptions={listBrandOptions()}
    />
  );
}

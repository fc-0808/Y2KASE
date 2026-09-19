/**
 * First-party catalog snapshot for the public Insights page.
 *
 * Counts are live active SKUs, not a survey and not a marketing round number.
 * MagSafe uses the same tag the storefront filter uses. Character/brand rows
 * reuse the cached collection tree so this page cannot disagree with the menu.
 */
import { eq, sql } from "drizzle-orm";
import { cache as reactCache } from "react";
import { CACHE_TAGS, cachedCatalogRead } from "@/lib/cache";
import { productTypeLabel } from "@/lib/catalog/product-types";
import { getCollectionTree, type CollectionNode } from "@/lib/collections";
import { db, isDbConfigured } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { getMagsafeFacetCounts } from "@/lib/products";

export type InsightsTypeRow = {
  id: string;
  label: string;
  count: number;
};

export type InsightsCollectionRow = {
  slug: string;
  name: string;
  kind: string;
  count: number;
};

export type CatalogInsights = {
  generatedAt: string;
  activeProducts: number;
  magsafe: number;
  nonMagsafe: number;
  byType: InsightsTypeRow[];
  collections: InsightsCollectionRow[];
};

const TYPE_COUNTS_KEY = ["catalog-insights-type-counts-v1"];

const getTypeCountsCached = cachedCatalogRead(
  computeTypeCounts,
  TYPE_COUNTS_KEY,
  { tags: [CACHE_TAGS.products] },
);

async function computeTypeCounts(): Promise<InsightsTypeRow[]> {
  const rows = await db
    .select({
      id: products.productType,
      count: sql<number>`count(*)::int`,
    })
    .from(products)
    .where(eq(products.status, "active"))
    .groupBy(products.productType);

  return rows
    .map((row) => ({
      id: row.id,
      label: productTypeLabel(row.id),
      count: row.count,
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
}

function flattenStocked(
  nodes: CollectionNode[],
  out: InsightsCollectionRow[] = [],
): InsightsCollectionRow[] {
  for (const node of nodes) {
    if (node.totalCount > 0 && (node.kind === "character" || node.kind === "brand")) {
      out.push({
        slug: node.slug,
        name: node.name,
        kind: node.kind,
        count: node.totalCount,
      });
    }
    flattenStocked(node.children, out);
  }
  return out;
}

const EMPTY_GENERATED_AT = "1970-01-01T00:00:00.000Z";

function emptyInsights(): CatalogInsights {
  return {
    generatedAt: EMPTY_GENERATED_AT,
    activeProducts: 0,
    magsafe: 0,
    nonMagsafe: 0,
    byType: [],
    collections: [],
  };
}

async function computeCatalogInsights(): Promise<CatalogInsights> {
  const [magsafe, byType, tree, [asOf]] = await Promise.all([
    getMagsafeFacetCounts(),
    getTypeCountsCached(),
    getCollectionTree(),
    db
      .select({ at: sql<Date | null>`max(${products.updatedAt})` })
      .from(products)
      .where(eq(products.status, "active")),
  ]);

  const collections = flattenStocked(tree)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 16);

  return {
    generatedAt: asOf?.at ? new Date(asOf.at).toISOString() : EMPTY_GENERATED_AT,
    activeProducts: magsafe.magsafe + magsafe.nonMagsafe,
    magsafe: magsafe.magsafe,
    nonMagsafe: magsafe.nonMagsafe,
    byType,
    collections,
  };
}

/** Request-deduped catalog snapshot for Insights. */
export const getCatalogInsights = reactCache(
  async (): Promise<CatalogInsights> => {
    if (!isDbConfigured()) return emptyInsights();
    return computeCatalogInsights();
  },
);

export function magsafeSharePercent(snapshot: CatalogInsights): number | null {
  if (snapshot.activeProducts <= 0) return null;
  return Math.round((snapshot.magsafe / snapshot.activeProducts) * 100);
}

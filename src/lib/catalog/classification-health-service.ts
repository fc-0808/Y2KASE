/**
 * The database side of the classification audit.
 *
 * Split from `./classification-health` so the pure verdict logic can be
 * imported by the product console, which is a client component: keeping the
 * Drizzle client on this side of the line is what stops a database driver from
 * being bundled into the browser.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { collections, productCollections, products } from "@/lib/db/schema";
import {
  assessClassification,
  type ClassificationHealth,
} from "@/lib/catalog/classification-health";
import { ensureBrandRegistry } from "@/lib/catalog/brand-registry";

/**
 * Audit every product's classification. Two queries, so it costs about the
 * same as rendering the list it annotates.
 */
export async function auditCatalogClassification(): Promise<
  Map<number, ClassificationHealth>
> {
  await ensureBrandRegistry();
  const [rows, memberships] = await Promise.all([
    db
      .select({
        id: products.id,
        title: products.title,
        brandName: products.brandName,
        characterName: products.characterName,
        brandEvidence: products.brandEvidence,
      })
      .from(products),
    db
      .select({
        productId: productCollections.productId,
        slug: collections.slug,
        kind: collections.kind,
      })
      .from(productCollections)
      .innerJoin(
        collections,
        eq(collections.id, productCollections.collectionId),
      ),
  ]);

  const byProduct = new Map<number, { slug: string; kind: string }[]>();
  for (const row of memberships) {
    const list = byProduct.get(row.productId) ?? [];
    list.push({ slug: row.slug, kind: row.kind });
    byProduct.set(row.productId, list);
  }

  const out = new Map<number, ClassificationHealth>();
  for (const row of rows) {
    out.set(row.id, assessClassification(row, byProduct.get(row.id) ?? []));
  }
  return out;
}

/** The same verdict for a subset of products, for post-write reporting. */
export async function auditClassificationFor(
  productIds: number[],
): Promise<Map<number, ClassificationHealth>> {
  const ids = Array.from(new Set(productIds));
  if (ids.length === 0) return new Map();
  await ensureBrandRegistry();

  const [rows, memberships] = await Promise.all([
    db
      .select({
        id: products.id,
        title: products.title,
        brandName: products.brandName,
        characterName: products.characterName,
        brandEvidence: products.brandEvidence,
      })
      .from(products)
      .where(inArray(products.id, ids)),
    db
      .select({
        productId: productCollections.productId,
        slug: collections.slug,
        kind: collections.kind,
      })
      .from(productCollections)
      .innerJoin(collections, eq(collections.id, productCollections.collectionId))
      .where(inArray(productCollections.productId, ids)),
  ]);

  const byProduct = new Map<number, { slug: string; kind: string }[]>();
  for (const row of memberships) {
    const list = byProduct.get(row.productId) ?? [];
    list.push({ slug: row.slug, kind: row.kind });
    byProduct.set(row.productId, list);
  }

  const out = new Map<number, ClassificationHealth>();
  for (const row of rows) {
    out.set(row.id, assessClassification(row, byProduct.get(row.id) ?? []));
  }
  return out;
}

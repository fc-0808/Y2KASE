import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { products, collections } from "@/lib/db/schema";
import { LEGAL_SLUGS } from "@/lib/legal";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

// Refresh the sitemap hourly so new products/collections appear without a deploy.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/products`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/collections`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/faq`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/contact`, changeFrequency: "monthly", priority: 0.4 },
    ...LEGAL_SLUGS.map((slug) => ({
      url: `${SITE_URL}/policies/${slug}`,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];

  if (!isDbConfigured()) return staticRoutes;

  try {
    const [prodRows, colRows] = await Promise.all([
      db
        .select({ slug: products.slug, updatedAt: products.updatedAt })
        .from(products)
        .where(eq(products.status, "active")),
      db
        .select({ slug: collections.slug, updatedAt: collections.updatedAt })
        .from(collections)
        .where(eq(collections.status, "active")),
    ]);

    const productRoutes: MetadataRoute.Sitemap = prodRows.map((p) => ({
      url: `${SITE_URL}/products/${p.slug}`,
      lastModified: p.updatedAt ?? undefined,
      changeFrequency: "weekly",
      priority: 0.7,
    }));

    const collectionRoutes: MetadataRoute.Sitemap = colRows.map((c) => ({
      url: `${SITE_URL}/collections/${c.slug}`,
      lastModified: c.updatedAt ?? undefined,
      changeFrequency: "weekly",
      priority: 0.6,
    }));

    return [...staticRoutes, ...collectionRoutes, ...productRoutes];
  } catch {
    // If the DB is unreachable at build/request time, still return static routes.
    return staticRoutes;
  }
}

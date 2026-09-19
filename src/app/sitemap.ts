import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { LEGAL_DOCS, LEGAL_SLUGS } from "@/lib/legal";
import { DEVICE_FAMILIES, deviceIsLive } from "@/lib/catalog/devices";
import { listPublishedPosts } from "@/lib/blog";
import { ROUTES } from "@/lib/routes";
import { getCollectionTree, type CollectionNode } from "@/lib/collections";
import { getDeviceFacetCounts } from "@/lib/products";
import { absoluteUrl, SITE_URL } from "@/lib/site";

/** Never durable ISR: a baked empty sitemap is worse than a CDN-cached live one. */
export const dynamic = "force-dynamic";
const SITEMAP_URL_LIMIT = 50_000;

function flattenCollections(nodes: CollectionNode[]): CollectionNode[] {
  return nodes.flatMap((node) => [
    node,
    ...flattenCollections(node.children),
  ]);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Live (stocked) device landing pages — high-intent SEO category pages.
  // comingSoon is not enough: clearing the AirPods flag with zero SKUs
  // must not submit an empty `/devices/airpods`.
  const deviceStock = await getDeviceFacetCounts().catch(() => undefined);
  const deviceRoutes: MetadataRoute.Sitemap = DEVICE_FAMILIES.flatMap((f) =>
    f.devices,
  )
    .filter((d) => deviceIsLive(d, deviceStock))
    .map((d) => ({
      url: `${SITE_URL}/devices/${d.id}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

  // Blog index + posts — the organic content engine.
  const [blogPosts, collectionTree] = await Promise.all([
    listPublishedPosts(),
    getCollectionTree(),
  ]);
  const blogRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.7 },
    ...blogPosts.map((p) => ({
      url: `${SITE_URL}/blog/${p.slug}`,
      lastModified: new Date(
        p.meta.modified ?? `${p.meta.date}T00:00:00Z`,
      ),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/products`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/collections`, changeFrequency: "weekly", priority: 0.8 },
    ...deviceRoutes,
    ...blogRoutes,
    {
      url: `${SITE_URL}${ROUTES.welcomeGift}`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}${ROUTES.insights}`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/faq`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/contact`, changeFrequency: "monthly", priority: 0.4 },
    ...LEGAL_SLUGS.map((slug) => ({
      url: `${SITE_URL}/policies/${slug}`,
      lastModified: new Date(`${LEGAL_DOCS[slug].updated}T00:00:00Z`),
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];

  // Active-but-empty taxonomy nodes are valid admin vocabulary, not useful
  // landing pages. Submitting them created dozens of thin URLs; only stocked
  // collection subtrees belong in the search sitemap.
  const collectionRoutes: MetadataRoute.Sitemap = flattenCollections(
    collectionTree,
  )
    .filter((collection) => collection.totalCount > 0)
    .map((collection) => ({
      url: `${SITE_URL}/collections/${collection.slug}`,
      changeFrequency: "weekly",
      priority: 0.6,
      ...(collection.imageUrl
        ? { images: [absoluteUrl(collection.imageUrl)] }
        : {}),
    }));

  if (!isDbConfigured()) return [...staticRoutes, ...collectionRoutes];

  try {
    const prodRows = await db.query.products.findMany({
      where: eq(products.status, "active"),
      columns: { slug: true, updatedAt: true },
      with: {
        images: {
          columns: { url: true },
          orderBy: (image, { asc }) => asc(image.position),
          limit: 10,
        },
      },
    });

    const productRoutes: MetadataRoute.Sitemap = prodRows.map((p) => ({
      url: `${SITE_URL}/products/${p.slug}`,
      lastModified: p.updatedAt ?? undefined,
      changeFrequency: "weekly",
      priority: 0.7,
      ...(p.images.length > 0
        ? { images: p.images.map((image) => absoluteUrl(image.url)) }
        : {}),
    }));

    const complete = [...staticRoutes, ...collectionRoutes, ...productRoutes];
    if (complete.length > SITEMAP_URL_LIMIT) {
      throw new Error(
        `Sitemap has ${complete.length} URLs; split it with generateSitemaps() before exceeding ${SITEMAP_URL_LIMIT}.`,
      );
    }
    return complete;
  } catch (error) {
    console.error("[sitemap] product query failed:", error);
    // Do not replace a previously complete sitemap with a successful but
    // product-less response. Throw so the CDN keeps the last good payload.
    throw new Error("Unable to build the product sitemap.", { cause: error });
  }
}

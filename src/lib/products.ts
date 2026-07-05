import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db, isDbConfigured } from "@/lib/db";
import { CACHE_TAGS } from "@/lib/cache";
import { products, productCollections } from "@/lib/db/schema";
import type { ProductWithRelations } from "@/lib/db/schema";
import {
  MODEL_OPTION_NAME,
  STYLE_OPTION_NAME,
  orderModels,
  orderStyles,
} from "@/lib/pricing";
import { productTypeLabel } from "@/lib/catalog/product-types";
import { deviceProductTypes } from "@/lib/catalog/devices";
import { resolveCollectionFilterIds } from "@/lib/collections";
import { getReviewSummaries } from "@/lib/reviews";

/** Attach published-review summaries to a list of products for card star ratings. */
async function withRatings(
  items: ProductListItem[],
): Promise<ProductListItem[]> {
  if (items.length === 0) return items;
  const summaries = await getReviewSummaries(items.map((i) => i.id));
  return items.map((i) => {
    const s = summaries.get(i.id);
    return s && s.count > 0 ? { ...i, rating: s } : i;
  });
}

export type ProductListItem = {
  id: number;
  slug: string;
  title: string;
  price: string;
  compareAtPrice: string | null;
  currency: string;
  tags: string[];
  featured: boolean;
  imageUrl: string | null;
  /** Published-review summary, attached for listing-card star ratings. */
  rating?: { count: number; average: number };
};

const PAGE_SIZE = 24;

export type ProductQuery = {
  search?: string;
  tag?: string;
  /** Device taxonomy id, e.g. "iphone" — maps to one or more product types. */
  device?: string;
  /** Collection slug — matches the collection and all of its descendants. */
  collection?: string;
  page?: number;
  sort?: "newest" | "price-asc" | "price-desc";
};

export async function getProducts(query: ProductQuery = {}): Promise<{
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, query.page ?? 1);
  const offset = (page - 1) * PAGE_SIZE;

  if (!isDbConfigured()) {
    return { items: [], total: 0, page, pageSize: PAGE_SIZE };
  }

  const filters = [eq(products.status, "active")];
  if (query.search) {
    filters.push(
      or(
        ilike(products.title, `%${query.search}%`),
        ilike(products.description, `%${query.search}%`),
      )!,
    );
  }
  if (query.tag) {
    filters.push(sql`${query.tag} = ANY(${products.tags})`);
  }

  // Device filter → restrict to the device's product type(s).
  if (query.device) {
    const types = deviceProductTypes(query.device);
    if (types && types.length > 0) {
      filters.push(inArray(products.productType, types));
    }
  }

  // Collection filter → product must belong to the collection or a descendant.
  if (query.collection) {
    const collectionIds = await resolveCollectionFilterIds(query.collection);
    if (collectionIds.length > 0) {
      filters.push(
        inArray(
          products.id,
          db
            .select({ id: productCollections.productId })
            .from(productCollections)
            .where(inArray(productCollections.collectionId, collectionIds)),
        ),
      );
    } else {
      // Unknown/empty collection → no matches rather than the whole catalog.
      filters.push(sql`false`);
    }
  }

  const where = and(...filters);

  const orderBy =
    query.sort === "price-asc"
      ? sql`${products.price} asc`
      : query.sort === "price-desc"
        ? sql`${products.price} desc`
        : desc(products.createdAt);

  const rows = await db.query.products.findMany({
    where,
    orderBy,
    limit: PAGE_SIZE,
    offset,
    with: {
      images: {
        orderBy: (img, { asc }) => asc(img.position),
        limit: 1,
      },
    },
  });

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(where);

  const items: ProductListItem[] = rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    currency: p.currency,
    tags: p.tags,
    featured: p.featured,
    imageUrl: p.images[0]?.url ?? null,
  }));

  return {
    items: await withRatings(items),
    total: count,
    page,
    pageSize: PAGE_SIZE,
  };
}

/**
 * Featured (or newest-as-fallback) products for the homepage "Bestsellers"
 * rail. The homepage is the highest-traffic, most cache-worthy surface, and
 * this result only changes when the catalog or its reviews do — so it is served
 * from the Data Cache and invalidated by tag from admin mutations.
 */
export function getFeaturedProducts(limit = 8): Promise<ProductListItem[]> {
  if (!isDbConfigured()) return Promise.resolve([]);
  return getFeaturedProductsCached(limit);
}

const getFeaturedProductsCached = unstable_cache(
  computeFeaturedProducts,
  ["featured-products"],
  { tags: [CACHE_TAGS.products, CACHE_TAGS.reviews], revalidate: 3600 },
);

async function computeFeaturedProducts(
  limit: number,
): Promise<ProductListItem[]> {
  // Hand-curated bestsellers: featured products in their merchandised order.
  // This is intentionally STABLE — it never changes when new products are
  // uploaded; only an operator editing the Bestsellers admin changes it.
  const rows = await db.query.products.findMany({
    where: and(eq(products.status, "active"), eq(products.featured, true)),
    orderBy: (p, { asc, desc }) => [asc(p.featuredPosition), desc(p.createdAt)],
    limit,
    with: {
      images: {
        orderBy: (img, { asc }) => asc(img.position),
        limit: 1,
      },
    },
  });

  if (rows.length > 0) {
    return withRatings(rows.map(toListItem));
  }

  // Fallback ONLY when nothing has been curated yet (fresh store): show the
  // newest products so the rail isn't empty. Once anything is featured, the
  // curated set above wins and uploads no longer reshuffle the homepage.
  const fallback = await db.query.products.findMany({
    where: eq(products.status, "active"),
    orderBy: desc(products.createdAt),
    limit,
    with: {
      images: {
        orderBy: (img, { asc }) => asc(img.position),
        limit: 1,
      },
    },
  });
  return withRatings(fallback.map(toListItem));
}

/**
 * Products for a homepage collection rail (e.g. Sanrio, Hello Kitty).
 *
 * A purpose-built, cached read for the homepage's editorial rails. Unlike
 * {@link getProducts} it skips the `count(*)` total (rails never paginate) and
 * the collection-filter round-trip is folded into a single query, so each rail
 * costs one product query + one ratings query instead of four. Tagged so admin
 * catalog/membership edits invalidate it on demand.
 */
export function getCollectionRail(
  slug: string,
  limit = 24,
): Promise<ProductListItem[]> {
  if (!isDbConfigured()) return Promise.resolve([]);
  return getCollectionRailCached(slug, limit);
}

const getCollectionRailCached = unstable_cache(
  computeCollectionRail,
  ["collection-rail"],
  {
    tags: [CACHE_TAGS.products, CACHE_TAGS.collections, CACHE_TAGS.reviews],
    revalidate: 3600,
  },
);

async function computeCollectionRail(
  slug: string,
  limit: number,
): Promise<ProductListItem[]> {
  const collectionIds = await resolveCollectionFilterIds(slug);
  if (collectionIds.length === 0) return [];

  const rows = await db.query.products.findMany({
    where: and(
      eq(products.status, "active"),
      inArray(
        products.id,
        db
          .select({ id: productCollections.productId })
          .from(productCollections)
          .where(inArray(productCollections.collectionId, collectionIds)),
      ),
    ),
    orderBy: desc(products.createdAt),
    limit,
    with: {
      images: { orderBy: (img, { asc }) => asc(img.position), limit: 1 },
    },
  });

  return withRatings(rows.map(toListItem));
}

/**
 * Recommend products related to a given one, for the PDP "You may also like"
 * rail. Relevance is layered: products sharing a collection (most relevant)
 * first, then topped up with other products of the same device/type. This lifts
 * AOV and pages-per-session, and deepens internal linking for crawlers.
 */
export async function getRelatedProducts(opts: {
  productId: number;
  productType: string;
  limit?: number;
}): Promise<ProductListItem[]> {
  if (!isDbConfigured()) return [];
  const limit = opts.limit ?? 8;

  // 1) Same-collection products (strongest relevance signal).
  const collRows = await db
    .select({ cid: productCollections.collectionId })
    .from(productCollections)
    .where(eq(productCollections.productId, opts.productId));
  const collectionIds = collRows.map((r) => r.cid);

  let related: ProductListItem[] = [];
  if (collectionIds.length > 0) {
    const idRows = await db
      .selectDistinct({ pid: productCollections.productId })
      .from(productCollections)
      .where(
        and(
          inArray(productCollections.collectionId, collectionIds),
          ne(productCollections.productId, opts.productId),
        ),
      );
    const ids = idRows.map((r) => r.pid);
    if (ids.length > 0) {
      const rows = await db.query.products.findMany({
        where: and(inArray(products.id, ids), eq(products.status, "active")),
        orderBy: desc(products.featured),
        limit,
        with: {
          images: { orderBy: (img, { asc }) => asc(img.position), limit: 1 },
        },
      });
      related = rows.map(toListItem);
    }
  }

  // 2) Top up with same-type products if we're short.
  if (related.length < limit) {
    const exclude = [opts.productId, ...related.map((r) => r.id)];
    const more = await db.query.products.findMany({
      where: and(
        eq(products.status, "active"),
        eq(products.productType, opts.productType),
        notInArray(products.id, exclude),
      ),
      orderBy: desc(products.createdAt),
      limit: limit - related.length,
      with: {
        images: { orderBy: (img, { asc }) => asc(img.position), limit: 1 },
      },
    });
    related = [...related, ...more.map(toListItem)];
  }

  return withRatings(related.slice(0, limit));
}

export async function getProductBySlug(
  slug: string,
): Promise<ProductWithRelations | null> {
  if (!isDbConfigured()) return null;
  const product = await db.query.products.findFirst({
    where: and(eq(products.slug, slug), eq(products.status, "active")),
    with: {
      images: { orderBy: (img, { asc }) => asc(img.position) },
      options: { orderBy: (opt, { asc }) => asc(opt.position) },
      variants: true,
    },
  });
  return product ?? null;
}

/**
 * Full product (any status) with ordered images + options for the admin
 * editor. Unlike {@link getProductBySlug} this does not filter by status, so
 * drafts are editable before publishing.
 */
export async function getProductForAdmin(
  id: number,
): Promise<ProductWithRelations | null> {
  if (!isDbConfigured()) return null;
  const product = await db.query.products.findFirst({
    where: eq(products.id, id),
    with: {
      images: { orderBy: (img, { asc }) => asc(img.position) },
      options: { orderBy: (opt, { asc }) => asc(opt.position) },
      variants: true,
    },
  });
  return product ?? null;
}

export async function getProductsByStatus(
  status: string,
): Promise<ProductListItem[]> {
  if (!isDbConfigured()) return [];
  const rows = await db.query.products.findMany({
    where: eq(products.status, status),
    orderBy: desc(products.createdAt),
    limit: 200,
    with: {
      images: {
        orderBy: (img, { asc }) => asc(img.position),
        limit: 1,
      },
    },
  });
  return rows.map(toListItem);
}

/**
 * A richer product view purpose-built for the product catalog feed
 * (Pinterest Catalogs / Google Merchant Center). Includes the full
 * description, product type and up to 10 ordered gallery images so the
 * feed can emit SEO-grade descriptions and additional_image_link entries.
 *
 * Prices are kept as the raw numeric strings from the DB (already in the
 * store's display currency, e.g. "19.99") — the feed formats them.
 */
export type CatalogFeedItem = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  productType: string;
  productTypeLabel: string;
  price: string;
  compareAtPrice: string | null;
  currency: string;
  tags: string[];
  /** Ordered gallery image URLs (first = primary). */
  images: string[];
};

export async function getCatalogFeedItems(): Promise<CatalogFeedItem[]> {
  if (!isDbConfigured()) return [];
  const rows = await db.query.products.findMany({
    where: eq(products.status, "active"),
    orderBy: desc(products.createdAt),
    limit: 1000,
    with: {
      images: {
        columns: { url: true, position: true },
        orderBy: (img, { asc }) => asc(img.position),
        limit: 10,
      },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    productType: p.productType,
    productTypeLabel: productTypeLabel(p.productType),
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    currency: p.currency,
    tags: p.tags ?? [],
    images: p.images.map((i) => i.url).filter((u): u is string => Boolean(u)),
  }));
}

/**
 * A flattened, dashboard-ready view of every product for the admin console.
 * Surfaces the current media count, offered styles and offered iPhone models
 * so the operator can see — and bulk-edit — the catalog's variation state at a
 * glance, without opening each product individually.
 */
export type AdminProductOverview = {
  id: number;
  slug: string;
  title: string;
  status: string;
  featured: boolean;
  currency: string;
  price: string;
  productType: string;
  /** Human label for the product type, e.g. "iPhone Case". */
  productTypeLabel: string;
  imageUrl: string | null;
  imageCount: number;
  hasVideo: boolean;
  /** Offered Style values in canonical (price) order. */
  availableStyles: string[];
  /** Offered iPhone Model values in canonical (release) order. */
  availableModels: string[];
  /** Collection ids this product is assigned to (for facet filtering). */
  collectionIds: number[];
  /** True when the product is classified as MagSafe (has the `magsafe` tag). */
  isMagsafe: boolean;
  /** True when MagSafe was a low-confidence guess awaiting human review. */
  needsMagsafeReview: boolean;
};

const STATUS_RANK: Record<string, number> = {
  draft: 0,
  active: 1,
  archived: 2,
};

export async function getAdminProductOverviews(): Promise<
  AdminProductOverview[]
> {
  if (!isDbConfigured()) return [];

  const rows = await db.query.products.findMany({
    orderBy: desc(products.createdAt),
    limit: 1000,
    with: {
      images: {
        columns: { id: true, url: true, position: true },
        orderBy: (img, { asc }) => asc(img.position),
      },
      options: { columns: { name: true, values: true } },
      collections: { columns: { collectionId: true } },
    },
  });

  const overviews = rows.map((p): AdminProductOverview => {
    const styleOpt = p.options.find((o) => o.name === STYLE_OPTION_NAME);
    const modelOpt = p.options.find((o) => o.name === MODEL_OPTION_NAME);
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      status: p.status,
      featured: p.featured,
      currency: p.currency,
      price: p.price,
      productType: p.productType,
      productTypeLabel: productTypeLabel(p.productType),
      imageUrl: p.images[0]?.url ?? null,
      imageCount: p.images.length,
      hasVideo: Boolean(p.videoUrl),
      availableStyles: orderStyles(styleOpt?.values ?? []),
      availableModels: orderModels(modelOpt?.values ?? []),
      collectionIds: p.collections.map((c) => c.collectionId),
      isMagsafe: (p.tags ?? []).includes("magsafe"),
      needsMagsafeReview: p.needsMagsafeReview,
    };
  });

  // Drafts first (they need review), then live, then archived; newest within.
  return overviews.sort(
    (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9),
  );
}

/** A product as shown in the Bestsellers curation admin. */
export type BestsellerItem = {
  id: number;
  title: string;
  slug: string;
  status: string;
  imageUrl: string | null;
  featuredPosition: number | null;
};

/** The curated bestsellers, in merchandised order (any status, for editing). */
export async function getBestsellers(): Promise<BestsellerItem[]> {
  if (!isDbConfigured()) return [];
  const rows = await db.query.products.findMany({
    where: eq(products.featured, true),
    orderBy: (p, { asc, desc }) => [asc(p.featuredPosition), desc(p.createdAt)],
    columns: {
      id: true,
      title: true,
      slug: true,
      status: true,
      featuredPosition: true,
    },
    with: {
      images: {
        columns: { url: true, position: true },
        orderBy: (i, { asc }) => asc(i.position),
        limit: 1,
      },
    },
    limit: 100,
  });
  return rows.map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    status: p.status,
    imageUrl: p.images[0]?.url ?? null,
    featuredPosition: p.featuredPosition,
  }));
}

/** Active products NOT yet featured — candidates to add to the rail. */
export async function getFeaturableProducts(
  limit = 500,
): Promise<BestsellerItem[]> {
  if (!isDbConfigured()) return [];
  const rows = await db.query.products.findMany({
    where: and(eq(products.status, "active"), eq(products.featured, false)),
    orderBy: desc(products.createdAt),
    columns: {
      id: true,
      title: true,
      slug: true,
      status: true,
      featuredPosition: true,
    },
    with: {
      images: {
        columns: { url: true, position: true },
        orderBy: (i, { asc }) => asc(i.position),
        limit: 1,
      },
    },
    limit,
  });
  return rows.map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    status: p.status,
    imageUrl: p.images[0]?.url ?? null,
    featuredPosition: p.featuredPosition,
  }));
}

export async function getAllProductSlugs(): Promise<string[]> {
  if (!isDbConfigured()) return [];
  const rows = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.status, "active"));
  return rows.map((r) => r.slug);
}

export async function getPopularTags(limit = 16): Promise<string[]> {
  if (!isDbConfigured()) return [];
  const rows = await db.execute<{ tag: string; n: number }>(sql`
    select unnest(tags) as tag, count(*)::int as n
    from products
    where status = 'active'
    group by tag
    order by n desc
    limit ${limit}
  `);
  // drizzle's neon-http returns { rows } | array depending on driver version.
  const data = (Array.isArray(rows) ? rows : rows.rows) as {
    tag: string;
    n: number;
  }[];
  return data.map((r) => r.tag);
}

function toListItem(p: {
  id: number;
  slug: string;
  title: string;
  price: string;
  compareAtPrice: string | null;
  currency: string;
  tags: string[];
  featured: boolean;
  images: { url: string }[];
}): ProductListItem {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    currency: p.currency,
    tags: p.tags,
    featured: p.featured,
    imageUrl: p.images[0]?.url ?? null,
  };
}

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { products } from "@/lib/db/schema";
import type { ProductWithRelations } from "@/lib/db/schema";

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
};

const PAGE_SIZE = 24;

export type ProductQuery = {
  search?: string;
  tag?: string;
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

  return { items, total: count, page, pageSize: PAGE_SIZE };
}

export async function getFeaturedProducts(
  limit = 8,
): Promise<ProductListItem[]> {
  if (!isDbConfigured()) return [];
  const rows = await db.query.products.findMany({
    where: and(eq(products.status, "active"), eq(products.featured, true)),
    orderBy: desc(products.createdAt),
    limit,
    with: {
      images: {
        orderBy: (img, { asc }) => asc(img.position),
        limit: 1,
      },
    },
  });

  if (rows.length > 0) {
    return rows.map(toListItem);
  }

  // Fallback: if nothing is explicitly featured yet, show the newest products.
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
  return fallback.map(toListItem);
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

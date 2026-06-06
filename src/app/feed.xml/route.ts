/**
 * GET /feed.xml — Google Merchant Center product feed (RSS 2.0 + g: namespace).
 *
 * This is the data source you point Google Merchant Center at to run Shopping /
 * Performance Max campaigns and free product listings — the channel that drives
 * the bulk of paid traffic for accessory brands like CASETiFY. We generate it
 * straight from the live catalog so it never drifts from the storefront.
 *
 * Resubmit cadence is controlled by Merchant Center; we revalidate hourly so a
 * newly published product appears without a deploy.
 */
import { and, eq, desc } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { absoluteUrl, BRAND } from "@/lib/seo";

export const revalidate = 3600;

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function item(p: {
  slug: string;
  title: string;
  description: string | null;
  price: string;
  currency: string;
  imageUrl: string | null;
}): string {
  const link = absoluteUrl(`/products/${p.slug}`);
  const price = `${Number(p.price).toFixed(2)} ${p.currency.toUpperCase()}`;
  const description =
    p.description?.trim().replace(/\s+/g, " ").slice(0, 5000) ||
    BRAND.description;

  // Only emit items with an image — Merchant Center rejects items without one.
  const imageTag = p.imageUrl
    ? `<g:image_link>${xmlEscape(p.imageUrl)}</g:image_link>`
    : "";

  return `    <item>
      <g:id>${xmlEscape(p.slug)}</g:id>
      <g:title>${xmlEscape(p.title)}</g:title>
      <g:description>${xmlEscape(description)}</g:description>
      <g:link>${xmlEscape(link)}</g:link>
      ${imageTag}
      <g:availability>in_stock</g:availability>
      <g:condition>new</g:condition>
      <g:price>${xmlEscape(price)}</g:price>
      <g:brand>${xmlEscape(BRAND.name)}</g:brand>
      <g:identifier_exists>no</g:identifier_exists>
      <g:product_type>Phone Cases &amp; Accessories</g:product_type>
      <g:google_product_category>267</g:google_product_category>
    </item>`;
}

export async function GET() {
  let rows: {
    slug: string;
    title: string;
    description: string | null;
    price: string;
    currency: string;
    imageUrl: string | null;
  }[] = [];

  if (isDbConfigured()) {
    try {
      const found = await db.query.products.findMany({
        where: and(eq(products.status, "active")),
        orderBy: desc(products.createdAt),
        columns: {
          slug: true,
          title: true,
          description: true,
          price: true,
          currency: true,
        },
        with: {
          images: {
            columns: { url: true },
            orderBy: (img, { asc }) => asc(img.position),
            limit: 1,
          },
        },
      });
      rows = found
        .map((p) => ({
          slug: p.slug,
          title: p.title,
          description: p.description,
          price: p.price,
          currency: p.currency,
          imageUrl: p.images[0]?.url ?? null,
        }))
        .filter((p) => p.imageUrl);
    } catch {
      rows = [];
    }
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xmlEscape(BRAND.name)}</title>
    <link>${absoluteUrl("/")}</link>
    <description>${xmlEscape(BRAND.description)}</description>
${rows.map(item).join("\n")}
  </channel>
</rss>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

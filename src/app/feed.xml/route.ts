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
import { isDbConfigured } from "@/lib/db";
import {
  getCatalogFeedItems,
  type CatalogFeedItem,
} from "@/lib/products";
import { absoluteUrl, BRAND } from "@/lib/seo";
import { googleProductCategoryId } from "@/lib/catalog/merchant";

// Never bake an empty catalog into a deployment when the build environment
// lacks database access. The CDN caches successful responses for one hour.
export const dynamic = "force-dynamic";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function item(p: CatalogFeedItem): string {
  const link = absoluteUrl(`/products/${p.slug}`);
  const currency = p.currency.toUpperCase();
  const currentPrice = Number(p.price);
  const compareAtPrice = Number(p.compareAtPrice);
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    console.error(`[merchant-feed] invalid price for ${p.slug}: ${p.price}`);
    return "";
  }
  const onSale =
    Number.isFinite(compareAtPrice) &&
    compareAtPrice > currentPrice &&
    currentPrice > 0;
  const regularPrice = `${(onSale ? compareAtPrice : currentPrice).toFixed(2)} ${currency}`;
  const salePrice = `${currentPrice.toFixed(2)} ${currency}`;
  const description =
    p.description?.trim().replace(/\s+/g, " ").slice(0, 5000) ||
    BRAND.description;

  const [primaryImage, ...additionalImages] = p.images;
  if (!primaryImage) return "";
  const googleCategory = googleProductCategoryId(p.productType);
  const imageTags = [
    `<g:image_link>${xmlEscape(absoluteUrl(primaryImage))}</g:image_link>`,
    ...additionalImages
      .slice(0, 9)
      .map(
        (image) =>
          `<g:additional_image_link>${xmlEscape(absoluteUrl(image))}</g:additional_image_link>`,
      ),
  ].join("\n      ");

  return `    <item>
      <g:id>${xmlEscape(p.slug)}</g:id>
      <g:title>${xmlEscape(p.title)}</g:title>
      <g:description>${xmlEscape(description)}</g:description>
      <g:link>${xmlEscape(link)}</g:link>
      ${imageTags}
      <g:availability>in_stock</g:availability>
      <g:condition>new</g:condition>
      <g:price>${xmlEscape(regularPrice)}</g:price>
      ${onSale ? `<g:sale_price>${xmlEscape(salePrice)}</g:sale_price>` : ""}
      <g:brand>${xmlEscape(BRAND.name)}</g:brand>
      <g:identifier_exists>no</g:identifier_exists>
      <g:product_type>${xmlEscape(p.productTypeLabel)}</g:product_type>
      ${googleCategory ? `<g:google_product_category>${googleCategory}</g:google_product_category>` : ""}
    </item>`;
}

export async function GET() {
  if (!isDbConfigured()) {
    console.error("[merchant-feed] DATABASE_URL is not configured.");
    return unavailableFeed();
  }

  let catalogItems: CatalogFeedItem[];
  try {
    catalogItems = await getCatalogFeedItems();
  } catch (error) {
    console.error("[merchant-feed] catalog query failed:", error);
    return unavailableFeed();
  }
  const renderedItems = catalogItems.map(item).filter(Boolean);
  const omittedItems = catalogItems.length - renderedItems.length;
  if (omittedItems > 0) {
    console.warn(
      `[merchant-feed] omitted ${omittedItems} product(s) with invalid price or imagery.`,
    );
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xmlEscape(BRAND.name)}</title>
    <link>${absoluteUrl("/")}</link>
    <description>${xmlEscape(BRAND.description)}</description>
${renderedItems.join("\n")}
  </channel>
</rss>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      "X-Robots-Tag": "noindex, follow",
      "X-Catalog-Items-Omitted": String(omittedItems),
    },
  });
}

function unavailableFeed(): Response {
  return new Response("Product feed temporarily unavailable.", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "300",
      "X-Robots-Tag": "noindex",
    },
  });
}

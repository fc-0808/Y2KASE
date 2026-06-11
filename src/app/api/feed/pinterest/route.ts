/**
 * GET /api/feed/pinterest
 *
 * Pinterest product catalog feed in Google Merchant Center RSS format.
 * Pinterest ingests this URL in the "Catalogs" section of Pinterest for Business.
 *
 * After connecting:
 *  1. Shopping Pins are auto-created from your product catalog
 *  2. "Shop the Look" AI can tag your products in user pins
 *  3. Performance+ Shopping Ads can dynamically pull from this feed
 *
 * Revalidates every hour (ISR). Includes all active products.
 *
 * How to connect:
 *  → pinterest.com/business/catalogs → Add source → RSS/ATOM
 *  → Enter: https://y2kase.com/api/feed/pinterest
 *
 * Note: prices are stored in the display currency as decimals (e.g. "19.99"),
 * so we format them directly — never divide by 100.
 */

import { NextResponse } from "next/server";
import { getCatalogFeedItems } from "@/lib/products";

export const runtime = "nodejs";
export const revalidate = 3600;

const BRAND = "Y2KASE";
const GOOGLE_CATEGORY =
  "Electronics > Communications > Telephony > Mobile Phone Accessories > Mobile Phone Cases";

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Parse a numeric-string price ("19.99") to a number; 0 on failure. */
function toAmount(value: string | null | undefined): number {
  const n = Number(value ?? "");
  return Number.isFinite(n) ? n : 0;
}

/**
 * Build a keyword-rich, search-optimised catalog description (Pinterest is a
 * visual search engine — the first ~80 chars matter most). Falls back to a
 * branded template when the product has no description.
 */
function feedDescription(item: {
  title: string;
  description: string | null;
  productTypeLabel: string;
  tags: string[];
}): string {
  const base =
    item.description?.trim() ||
    `${item.title} — a cute, trend-forward ${item.productTypeLabel.toLowerCase()} from Y2KASE.`;
  const styleCues = item.tags.slice(0, 5).join(", ");
  const tail = styleCues
    ? ` Kawaii & Y2K aesthetic: ${styleCues}. Shop Y2KASE ✨`
    : " Kawaii & Y2K phone accessories by Y2KASE ✨";
  // Keep the description well under feed limits (~5000 chars) but rich.
  return `${base}${tail}`.slice(0, 900);
}

export async function GET() {
  const SITE =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://y2kase.com";

  const products = await getCatalogFeedItems();

  const items = products
    .filter((p) => p.images.length > 0)
    .map((p) => {
      const currency = p.currency ?? "USD";
      const productUrl = `${SITE}/products/${p.slug}`;
      const primaryImage = p.images[0];

      const priceAmount = toAmount(p.price);
      const compareAmount = toAmount(p.compareAtPrice);
      // A genuine markdown exists when the compare-at price is higher than the
      // current price. In that case the RSS regular price is the higher
      // compare-at value and g:sale_price carries the discounted price.
      const onSale = compareAmount > priceAmount && priceAmount > 0;
      const regularPrice = (onSale ? compareAmount : priceAmount).toFixed(2);
      const salePrice = priceAmount.toFixed(2);

      // Up to 9 additional images (Pinterest/Google allow 10 image links total).
      const additionalImages = p.images.slice(1, 10);

      const lines = [
        `    <item>`,
        `      <g:id>${p.id}</g:id>`,
        `      <title>${xmlEscape(p.title)}</title>`,
        `      <description>${xmlEscape(feedDescription(p))}</description>`,
        `      <link>${xmlEscape(productUrl)}</link>`,
        `      <g:image_link>${xmlEscape(primaryImage)}</g:image_link>`,
        ...additionalImages.map(
          (img) => `      <g:additional_image_link>${xmlEscape(img)}</g:additional_image_link>`,
        ),
        `      <g:price>${regularPrice} ${currency}</g:price>`,
        ...(onSale
          ? [`      <g:sale_price>${salePrice} ${currency}</g:sale_price>`]
          : []),
        `      <g:brand>${BRAND}</g:brand>`,
        `      <g:condition>new</g:condition>`,
        `      <g:availability>in stock</g:availability>`,
        `      <g:google_product_category>${xmlEscape(GOOGLE_CATEGORY)}</g:google_product_category>`,
        `      <g:product_type>${xmlEscape(p.productTypeLabel)}</g:product_type>`,
        // We don't carry manufacturer GTIN/MPN for these products — declare so
        // the catalog isn't penalised for missing unique identifiers.
        `      <g:identifier_exists>no</g:identifier_exists>`,
        `      <g:item_group_id>${p.id}</g:item_group_id>`,
        `    </item>`,
      ];

      return lines.join("\n");
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>${xmlEscape(BRAND)} — Kawaii &amp; Y2K Phone Cases</title>
    <link>${SITE}</link>
    <description>Kawaii, Y2K &amp; holographic phone cases, charms and accessories. Express your vibe. ✨</description>
${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

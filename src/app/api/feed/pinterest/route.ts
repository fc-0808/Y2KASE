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
 */

import { NextResponse } from "next/server";
import { getProductsByStatus } from "@/lib/products";

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

export async function GET() {
  const SITE =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://y2kase.com";

  const products = await getProductsByStatus("active");

  const items = products
    .map((p) => {
      const price = (Number(p.price ?? 0) / 100).toFixed(2);
      const currency = p.currency ?? "USD";
      const productUrl = `${SITE}/products/${p.slug}`;
      const image = p.imageUrl ?? "";

      // Build availability string
      const availability = "in stock";

      // Pinterest requires at least id, title, description, link, image_link, price, availability
      const lines = [
        `    <item>`,
        `      <g:id>${p.id}</g:id>`,
        `      <title>${xmlEscape(p.title)}</title>`,
        `      <description>${xmlEscape(
          p.title + " — Kawaii & Y2K phone accessories by Y2KASE ✨",
        )}</description>`,
        `      <link>${xmlEscape(productUrl)}</link>`,
        `      <g:image_link>${xmlEscape(image)}</g:image_link>`,
        `      <g:price>${price} ${currency}</g:price>`,
        ...(p.compareAtPrice && p.compareAtPrice > p.price
          ? [
              `      <g:sale_price>${price} ${currency}</g:sale_price>`,
              `      <g:sale_price_effective_date>2024-01-01T00:00:00Z/2030-01-01T00:00:00Z</g:sale_price_effective_date>`,
            ]
          : []),
        `      <g:brand>${BRAND}</g:brand>`,
        `      <g:condition>new</g:condition>`,
        `      <g:availability>${availability}</g:availability>`,
        `      <g:google_product_category>${xmlEscape(GOOGLE_CATEGORY)}</g:google_product_category>`,
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

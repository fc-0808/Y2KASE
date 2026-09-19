/**
 * A concise, curated navigation file for agents that choose to consume the
 * community llms.txt convention. It complements—never replaces—HTML, robots,
 * structured data and the XML sitemap, which remain the authoritative signals.
 */
import { absoluteUrl, BRAND } from "@/lib/seo";

export const revalidate = 86400;

export function GET() {
  const body = `# ${BRAND.name}

> ${BRAND.description}

Canonical website: ${absoluteUrl("/")}
Support: ${BRAND.email}

## Shopping

- [Shop all products](${absoluteUrl("/products")}): Current catalog, prices, availability, product options and customer reviews.
- [Browse collections](${absoluteUrl("/collections")}): Character, brand and aesthetic collections.
- [Shop iPhone cases](${absoluteUrl("/devices/iphone")}): Compatibility guidance and available iPhone case designs.
- [Kawaii phone cases](${absoluteUrl("/collections/kawaii")}): Cute character and pastel designs.
- [Y2K phone cases](${absoluteUrl("/collections/y2k")}): Early-2000s holographic and chrome looks.
- [MagSafe phone cases](${absoluteUrl("/collections/magsafe")}): Cases with a built-in magnetic charging ring.

## Brand and customer information

- [About Y2KASE](${absoluteUrl("/about")}): Brand background and product commitments.
- [Frequently asked questions](${absoluteUrl("/faq")}): Shipping, compatibility, product and return answers.
- [Contact](${absoluteUrl("/contact")}): Official customer-support channel.
- [Shipping policy](${absoluteUrl("/policies/shipping-policy")}): Processing, delivery, tracking and customs information.
- [Refund and return policy](${absoluteUrl("/policies/refund-policy")}): Current return and refund terms.
- [Terms of service](${absoluteUrl("/policies/terms-of-service")}): Purchase terms.
- [Privacy policy](${absoluteUrl("/policies/privacy-policy")}): Data handling and privacy terms.

## Editorial and machine-readable feeds

- [The Y2KASE Edit](${absoluteUrl("/blog")}): Style guides, trend reports and product how-tos.
- [XML sitemap](${absoluteUrl("/sitemap.xml")}): Canonical public URL inventory.
- [Blog RSS](${absoluteUrl("/blog/rss.xml")}): Published editorial updates.
- [Merchant product feed](${absoluteUrl("/feed.xml")}): Current machine-readable catalog data.

Product prices, stock, compatibility and policies can change. Treat each linked canonical page as authoritative at retrieval time.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control":
        "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}

/**
 * Legal / policy content — single source of truth for the storefront policy
 * pages. Ported from the previous Shopify store and updated for the new stack
 * (Stripe payments, Hong Kong entity). Content is first-party and trusted, so
 * pages render it as HTML inside a styled `.legal-prose` container.
 *
 * Keep `hello@y2kase.com` and the brand voice consistent across all docs.
 */

export type LegalDoc = {
  slug: string;
  title: string;
  /** Short description for <meta> + page subtitle. */
  description: string;
  /** ISO date shown as "Last updated". Bump when you edit the body. */
  updated: string;
  /** Trusted, first-party HTML rendered inside `.legal-prose`. */
  body: string;
};

const SUPPORT_EMAIL = "hello@y2kase.com";

export const LEGAL_DOCS: Record<string, LegalDoc> = {
  "refund-policy": {
    slug: "refund-policy",
    title: "Refund & Return Policy",
    description:
      "How returns, refunds, exchanges and damaged items are handled at Y2KASE.",
    updated: "2026-06-04",
    body: `
<p>We want you to love your Y2KASE order. If something isn't right, we're here to help. 💕</p>
<h2>Returns</h2>
<p>We accept returns within <strong>30 days</strong> of delivery. Items must be unused, in original condition, and in original packaging.</p>
<p>To start a return, email us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> with your order number and reason for return.</p>
<h2>Refunds</h2>
<p>Once your return is received and inspected, we'll notify you by email. Approved refunds are processed within <strong>5–7 business days</strong> back to your original payment method.</p>
<h2>Exchanges</h2>
<p>We offer exchanges for different variants (phone model, bundle option) within 30 days. Contact us and we'll arrange a replacement.</p>
<h2>Damaged or Incorrect Items</h2>
<p>If your item arrives damaged or you received the wrong item, please contact us within <strong>7 days</strong> of delivery with photos and we'll send a replacement at no cost.</p>
<h2>Non-returnable Items</h2>
<ul><li>Items returned after 30 days</li><li>Items with visible wear or damage caused by the customer</li></ul>
<h2>Contact</h2>
<p>Email: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>`,
  },

  "shipping-policy": {
    slug: "shipping-policy",
    title: "Shipping Policy",
    description:
      "Processing times, worldwide shipping estimates, tracking, customs and rates.",
    updated: "2026-06-04",
    body: `
<h2>Processing Time</h2>
<p>Orders are processed within <strong>1–3 business days</strong> after payment confirmation. Orders placed on weekends or public holidays are processed the next business day.</p>
<h2>Shipping Times</h2>
<table>
<thead><tr><th>Destination</th><th>Standard</th><th>Express</th></tr></thead>
<tbody>
<tr><td>Hong Kong</td><td>1–3 days</td><td>Next day</td></tr>
<tr><td>United States</td><td>7–14 days</td><td>3–5 days</td></tr>
<tr><td>United Kingdom</td><td>7–14 days</td><td>3–5 days</td></tr>
<tr><td>European Union</td><td>7–14 days</td><td>3–7 days</td></tr>
<tr><td>Rest of World</td><td>10–21 days</td><td>5–10 days</td></tr>
</tbody>
</table>
<h2>Shipping Rates</h2>
<p>Shipping is calculated at checkout based on your destination. <strong>Free standard shipping</strong> is available on qualifying orders — you'll see the threshold in your bag.</p>
<h2>Tracking</h2>
<p>All orders include a tracking number sent by email once dispatched. You can track your order via the carrier's website.</p>
<h2>Customs &amp; Duties</h2>
<p>International orders may be subject to customs duties or import taxes, which are the buyer's responsibility. These fees are not included in our shipping rates.</p>
<h2>Contact</h2>
<p>For shipping enquiries: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>`,
  },

  "privacy-policy": {
    slug: "privacy-policy",
    title: "Privacy Policy",
    description:
      "How Y2KASE collects, uses and protects your personal information.",
    updated: "2026-06-04",
    body: `
<p>Y2KASE ("we", "us", "our") is committed to protecting your personal information. This policy explains how we collect, use, and protect your data.</p>
<h2>Information We Collect</h2>
<ul>
<li><strong>Order information:</strong> name, email, shipping address, and phone number. Payment card details are entered directly with our payment processor (Stripe) and never touch our servers.</li>
<li><strong>Device information:</strong> IP address, browser type, and pages visited (via cookies).</li>
<li><strong>Marketing preferences:</strong> only if you opt in.</li>
</ul>
<h2>How We Use Your Information</h2>
<ul>
<li>To process and fulfil your orders</li>
<li>To send order confirmations and shipping updates</li>
<li>To improve our store and customer experience</li>
<li>To send marketing emails (only with your consent)</li>
</ul>
<h2>Sharing Your Information</h2>
<p>We do not sell your personal data. We share information only with the service providers necessary to operate our store — including <strong>Stripe</strong> (payment processing), our shipping carriers, and our email provider.</p>
<h2>Your Rights (GDPR)</h2>
<p>If you are located in the EU or UK, you have the right to access, correct, or delete your personal data. Contact us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> to exercise these rights.</p>
<h2>Cookies</h2>
<p>We use cookies to maintain your shopping session, remember preferences, and analyse traffic. You can disable cookies in your browser settings.</p>
<h2>Data Retention</h2>
<p>We retain order data for 7 years for accounting purposes. You may request deletion of marketing data at any time.</p>
<h2>Contact</h2>
<p>Data controller: Y2KASE · Email: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>`,
  },

  "terms-of-service": {
    slug: "terms-of-service",
    title: "Terms of Service",
    description: "The terms you agree to when purchasing from Y2KASE.",
    updated: "2026-06-04",
    body: `
<p>By purchasing from Y2KASE, you agree to the following terms.</p>
<h2>Products</h2>
<p>All products are described as accurately as possible. Colours may vary slightly due to screen settings. We reserve the right to limit quantities or discontinue products.</p>
<h2>Pricing</h2>
<p>Prices are displayed in your local currency where available. All prices include applicable taxes where required by law. We reserve the right to change prices at any time.</p>
<h2>Orders &amp; Payment</h2>
<p>Placing an order is an offer to purchase. Payments are processed securely by <strong>Stripe</strong>. We reserve the right to cancel any order due to pricing errors, stock issues, or suspected fraud. You'll be notified and fully refunded if an order is cancelled.</p>
<h2>Intellectual Property</h2>
<p>All product images, descriptions, and branding are the property of Y2KASE or used under license. You may not reproduce or distribute our content without written permission.</p>
<h2>Character Licensing</h2>
<p>Character names and likenesses are trademarks of their respective owners. Character-based products are sold under the appropriate licensing arrangements.</p>
<h2>Limitation of Liability</h2>
<p>Y2KASE is not liable for any indirect, incidental, or consequential damages arising from the use of our products or services.</p>
<h2>Governing Law</h2>
<p>These terms are governed by the laws of the Hong Kong SAR.</p>
<h2>Contact</h2>
<p>Email: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>`,
  },
};

export const LEGAL_SLUGS = Object.keys(LEGAL_DOCS);

export function getLegalDoc(slug: string): LegalDoc | null {
  return LEGAL_DOCS[slug] ?? null;
}

export { SUPPORT_EMAIL };

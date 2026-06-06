import type { Metadata } from "next";
import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/legal";
import { JsonLd } from "@/components/JsonLd";
import { faqJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Answers to common questions about Y2KASE orders, shipping, products and returns.",
  alternates: { canonical: "/faq" },
};

/**
 * FAQ content — single source of truth. Rendered both as visible HTML below and
 * as FAQPage structured data so the answers stay in sync. Google requires the
 * structured-data text to match what users see on the page.
 */
const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "How long does shipping take?",
    answer:
      "Standard shipping takes 7–14 business days for international orders, and 1–3 days within Hong Kong. Express options are available at checkout. See our Shipping Policy for full details.",
  },
  {
    question: "Can I track my order?",
    answer:
      "Yes — all orders include a tracking number sent to your email once dispatched.",
  },
  {
    question: "Do you ship worldwide?",
    answer:
      "Yes, we ship to most countries. You'll see shipping options and any free-shipping threshold at checkout.",
  },
  {
    question: "Are the MagSafe cases compatible with MagSafe chargers?",
    answer:
      "Yes. All cases marked \"MagSafe\" contain built-in magnets aligned to Apple's MagSafe standard. They work with MagSafe chargers, wallets, and other MagSafe accessories.",
  },
  {
    question: "Which iPhone models are compatible?",
    answer:
      "Most cases are available for iPhone 13, 14, 15, 16, and 17 series (including Pro and Pro Max). The specific models are listed on each product page.",
  },
  {
    question: "Are the charms removable?",
    answer:
      "Yes — charms attach via a keyring-style clip and can be removed or swapped. Some cases also sell the charm separately as a variant.",
  },
  {
    question: "What is the \"Case + Grip + Charm\" option?",
    answer:
      "This bundle includes the case, a MagSafe-compatible pop grip, and a character charm. You can also choose just the case, or the case with only the grip or charm — select your preferred combination from the style selector on the product page.",
  },
  {
    question: "What is your return policy?",
    answer:
      "We accept returns within 30 days of delivery for unused items in original condition. See our Refund Policy for full details.",
  },
  {
    question: "My item arrived damaged — what do I do?",
    answer: `We're so sorry! Please email us at ${SUPPORT_EMAIL} within 7 days of delivery with photos of the damage and your order number. We'll arrange a replacement promptly.`,
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <JsonLd data={faqJsonLd(FAQ_ITEMS)} />
      <header className="mb-8">
        <div className="h-1 w-16 rounded-full bg-holo-vivid" />
        <h1 className="mt-4 font-display text-3xl font-black sm:text-4xl">
          Frequently Asked Questions
        </h1>
        <p className="mt-2 text-[var(--foreground)]/65">
          Everything you need to know before you shop, bestie. 💕
        </p>
      </header>

      <article className="legal-prose">
        <h2>Orders &amp; Shipping</h2>
        <h3>How long does shipping take?</h3>
        <p>
          Standard shipping takes 7–14 business days for international orders,
          and 1–3 days within Hong Kong. Express options are available at
          checkout. See our{" "}
          <Link href="/policies/shipping-policy">Shipping Policy</Link> for full
          details.
        </p>
        <h3>Can I track my order?</h3>
        <p>Yes — all orders include a tracking number sent to your email once dispatched.</p>
        <h3>Do you ship worldwide?</h3>
        <p>Yes, we ship to most countries. You&apos;ll see shipping options and any free-shipping threshold at checkout.</p>

        <h2>Products</h2>
        <h3>Are the MagSafe cases compatible with MagSafe chargers?</h3>
        <p>
          Yes. All cases marked &quot;MagSafe&quot; contain built-in magnets aligned to
          Apple&apos;s MagSafe standard. They work with MagSafe chargers, wallets,
          and other MagSafe accessories.
        </p>
        <h3>Which iPhone models are compatible?</h3>
        <p>
          Most cases are available for iPhone 13, 14, 15, 16, and 17 series
          (including Pro and Pro Max). The specific models are listed on each
          product page.
        </p>
        <h3>Are the charms removable?</h3>
        <p>
          Yes — charms attach via a keyring-style clip and can be removed or
          swapped. Some cases also sell the charm separately as a variant.
        </p>
        <h3>What is the &quot;Case + Grip + Charm&quot; option?</h3>
        <p>
          This bundle includes the case, a MagSafe-compatible pop grip, and a
          character charm. You can also choose just the case, or the case with
          only the grip or charm — select your preferred combination from the
          style selector on the product page.
        </p>

        <h2>Returns &amp; Refunds</h2>
        <h3>What is your return policy?</h3>
        <p>
          We accept returns within 30 days of delivery for unused items in
          original condition. See our{" "}
          <Link href="/policies/refund-policy">Refund Policy</Link> for full
          details.
        </p>
        <h3>My item arrived damaged — what do I do?</h3>
        <p>
          We&apos;re so sorry! Please email us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> within 7 days of
          delivery with photos of the damage and your order number. We&apos;ll
          arrange a replacement promptly.
        </p>

        <h2>Still have questions?</h2>
        <p>
          Contact us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> — we
          respond within 24 hours.
        </p>
      </article>
    </div>
  );
}

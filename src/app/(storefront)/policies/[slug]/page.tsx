import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLegalDoc, LEGAL_SLUGS } from "@/lib/legal";
import { JsonLd } from "@/components/JsonLd";
import {
  breadcrumbJsonLd,
  MERCHANT_RETURN_POLICY_ANCHOR,
  publicPageMetadata,
  SHIPPING_SERVICE_ANCHOR,
  webPageJsonLd,
} from "@/lib/seo";

// Policies are static content — prerender all of them at build time.
export const dynamicParams = false;

export function generateStaticParams() {
  return LEGAL_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = getLegalDoc(slug);
  if (!doc) return {};
  return publicPageMetadata({
    title: doc.title,
    description: doc.description,
    path: `/policies/${doc.slug}`,
  });
}

export default async function PolicyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = getLegalDoc(slug);
  if (!doc) notFound();

  const updated = new Date(doc.updated).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const policyAnchor =
    doc.slug === "refund-policy"
      ? MERCHANT_RETURN_POLICY_ANCHOR
      : doc.slug === "shipping-policy"
        ? SHIPPING_SERVICE_ANCHOR
        : undefined;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", url: "/" },
            { name: doc.title, url: `/policies/${doc.slug}` },
          ]),
          webPageJsonLd({
            name: doc.title,
            description: doc.description,
            url: `/policies/${doc.slug}`,
          }),
        ]}
      />
      <header id={policyAnchor} className="mb-8 scroll-mt-24">
        <div className="h-1 w-16 rounded-full bg-holo-vivid" />
        <h1 className="mt-4 font-display text-3xl font-black sm:text-4xl">
          {doc.title}
        </h1>
        <p className="mt-2 text-[var(--foreground)]/65">{doc.description}</p>
        <p className="mt-1 text-xs text-[var(--foreground)]/45">
          Last updated {updated}
        </p>
      </header>

      <article
        className="legal-prose"
        dangerouslySetInnerHTML={{ __html: doc.body }}
      />
    </div>
  );
}

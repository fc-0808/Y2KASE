import { SUPPORT_EMAIL } from "@/lib/legal";
import { SUPPORT_RESPONSE_TIME } from "@/lib/support/constants";
import { JsonLd } from "@/components/JsonLd";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import { FaqAnswer } from "@/components/FaqAnswer";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  publicPageMetadata,
} from "@/lib/seo";
import { PAGE_COPY } from "@/lib/seo/copy";
import { FAQ_ITEMS, FAQ_SECTIONS } from "@/lib/seo/faq";

const PATH = "/faq";
const CRUMBS = [
  { name: "Home", url: "/" },
  { name: "FAQ", url: PATH },
];

export const metadata = publicPageMetadata({
  title: PAGE_COPY.faq.title,
  description: PAGE_COPY.faq.description,
  path: PATH,
});

export default function FaqPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <JsonLd data={[breadcrumbJsonLd(CRUMBS), faqJsonLd(FAQ_ITEMS)]} />
      <PageBreadcrumbs crumbs={CRUMBS} />
      <header className="mb-8">
        <div className="h-1 w-16 rounded-full bg-holo-vivid" />
        <h1 className="mt-4 font-display text-3xl font-black sm:text-4xl">
          {PAGE_COPY.faq.heading}
        </h1>
        <p className="mt-2 text-[var(--foreground)]/65">
          Everything you need to know before you shop, bestie. 💕
        </p>
      </header>

      <article className="legal-prose">
        {FAQ_SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.items.map((item) => (
              <div key={item.question}>
                <h3>{item.question}</h3>
                <p>
                  <FaqAnswer answer={item.answer} />
                </p>
              </div>
            ))}
          </section>
        ))}

        <h2>Still have questions?</h2>
        <p>
          Contact us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>{" "}
          — {SUPPORT_RESPONSE_TIME.toLowerCase()}.
        </p>
      </article>
    </div>
  );
}

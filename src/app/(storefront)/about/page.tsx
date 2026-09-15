import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/legal";
import { JsonLd } from "@/components/JsonLd";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import { PreferredSourceCard } from "@/components/PreferredSourceCard";
import {
  absoluteUrl,
  breadcrumbJsonLd,
  publicPageMetadata,
  webPageJsonLd,
} from "@/lib/seo";
import { PAGE_COPY } from "@/lib/seo/copy";
import { SHIPPING_COUNTRIES, SHIPPING_MARKETS_SUMMARY } from "@/lib/shipping";
import { ROUTES } from "@/lib/routes";
import { IPHONE_FIT } from "@/lib/pricing";
import {
  AIRPODS_4_5,
  AIRPODS_SHARED_FIT_NOTE,
} from "@/lib/catalog/airpods";

const PATH = "/about";
const CRUMBS = [
  { name: "Home", url: "/" },
  { name: "About", url: PATH },
];

export const metadata = publicPageMetadata({
  title: PAGE_COPY.about.title,
  description: PAGE_COPY.about.description,
  path: PATH,
});

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <JsonLd
        data={[
          webPageJsonLd({
            type: "AboutPage",
            name: PAGE_COPY.about.heading,
            description: PAGE_COPY.about.description,
            url: PATH,
            mainEntity: absoluteUrl("/#organization"),
          }),
          breadcrumbJsonLd(CRUMBS),
        ]}
      />
      <PageBreadcrumbs crumbs={CRUMBS} />
      <header className="mb-8">
        <div className="h-1 w-16 rounded-full bg-holo-vivid" />
        <h1 className="mt-4 font-display text-3xl font-black sm:text-4xl">
          {PAGE_COPY.about.heading}
        </h1>
        <p className="mt-2 text-[var(--foreground)]/65">
          A Hong Kong kawaii and Y2K phone-accessories merchant — cases, grips
          and charms, with MagSafe labelled only after review.
        </p>
      </header>

      <article className="legal-prose">
        <p>
          Y2KASE is a kawaii and Y2K phone accessories brand. We sell character
          and original iPhone cases, MagSafe grips and charms. The company is
          organized under the laws of the Hong Kong SAR. Customer email is{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. We ship to{" "}
          {SHIPPING_MARKETS_SUMMARY} ({SHIPPING_COUNTRIES.length} markets).
        </p>

        <h2 id="merchandising">Who writes and files the catalog</h2>
        <p>
          Public-facing editorial and product copy is published as{" "}
          <strong>The Y2KASE Team</strong> — the merchandising people who ingest
          photography, assign brands and characters, and review MagSafe. Flagship
          guides are hand-authored. First-party counts of what is actually in
          stock live on{" "}
          <Link href={ROUTES.insights}>What&apos;s in the catalog</Link>.
        </p>

        <h2>How we decide MagSafe</h2>
        <p>
          MagSafe is not inferred from the word appearing in a title. A case is
          tagged MagSafe only when the photos show a magnet ring (or equivalent
          evidence) at high confidence, or a human confirms it in the review
          queue. The full process is in{" "}
          <Link href="/blog/how-we-verify-magsafe">
            How we verify MagSafe
          </Link>
          . Shop the tagged set on{" "}
          <Link href="/collections/magsafe">MagSafe phone cases</Link>.
        </p>

        <h2>Licensed characters vs originals</h2>
        <p>
          Licensed IP (Sanrio, Miffy, Tamagotchi and others) is filed onto its
          own brand or character collection so a Hello Kitty case cannot sit in
          Originals. Originals are designs that are not tied to a licensed
          character. Browse{" "}
          <Link href="/collections/sanrio">Sanrio phone cases</Link>,{" "}
          <Link href="/collections/kawaii">kawaii phone cases</Link>, or{" "}
          <Link href="/collections/originals">original phone cases</Link>.
        </p>

        <h2>iPhone fit</h2>
        <p>
          Cases are cut for {IPHONE_FIT.through}, including Pro and Pro Max.
          The exact model is an option on the product page — that is the same
          list published on{" "}
          <Link href="/devices/iphone">iPhone cases</Link>.
        </p>

        <h2>AirPods fit</h2>
        <p>
          AirPods cases are a separate product from iPhone cases.{" "}
          {AIRPODS_SHARED_FIT_NOTE} That mould is listed as {AIRPODS_4_5}.
          AirPods Pro, AirPods 3 and AirPods 1 / 2 are different shells —
          pick the model you own on the product page.
        </p>

        <h2>Returns and shipping</h2>
        <ul>
          <li>
            Tracked shipping across {SHIPPING_COUNTRIES.length} supported
            markets —{" "}
            <Link href="/policies/shipping-policy">Shipping Policy</Link>
          </li>
          <li>
            30-day returns for unused items in original packaging —{" "}
            <Link href="/policies/refund-policy">Refund Policy</Link>
          </li>
        </ul>

        <h2>Find us</h2>
        <p>
          Email: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          <br />
          Instagram:{" "}
          <a
            href="https://instagram.com/y2kase.co"
            target="_blank"
            rel="noopener noreferrer"
          >
            @y2kase.co
          </a>
        </p>
      </article>

      <div className="mt-12">
        <PreferredSourceCard />
      </div>
    </div>
  );
}

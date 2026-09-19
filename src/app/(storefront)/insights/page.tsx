import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { PageBreadcrumbs } from "@/components/PageBreadcrumbs";
import { PreferredSourceCard } from "@/components/PreferredSourceCard";
import {
  breadcrumbJsonLd,
  datasetJsonLd,
  publicPageMetadata,
  webPageJsonLd,
} from "@/lib/seo";
import {
  getCatalogInsights,
  magsafeSharePercent,
} from "@/lib/seo/catalog-insights";
import { PAGE_COPY } from "@/lib/seo/copy";
import { ROUTES } from "@/lib/routes";
import { IPHONE_MODELS } from "@/lib/pricing";

/** Catalog insights: never durable ISR. CDN caches the HTML. */
export const dynamic = "force-dynamic";

const PATH = ROUTES.insights;

export const metadata = publicPageMetadata({
  title: PAGE_COPY.insights.title,
  description: PAGE_COPY.insights.description,
  path: PATH,
});

const CRUMBS = [
  { name: "Home", url: "/" },
  { name: "Insights", url: PATH },
];

export default async function InsightsPage() {
  const snapshot = await getCatalogInsights();
  const magShare = magsafeSharePercent(snapshot);
  const generated = new Date(snapshot.generatedAt);
  const generatedLabel = generated.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <JsonLd
        data={[
          webPageJsonLd({
            name: PAGE_COPY.insights.heading,
            description: PAGE_COPY.insights.description,
            url: PATH,
          }),
          datasetJsonLd({
            name: PAGE_COPY.insights.heading,
            description: PAGE_COPY.insights.description,
            url: PATH,
            dateModified: snapshot.generatedAt,
            variables: [
              "active SKUs",
              "MagSafe-tagged SKUs",
              "product type",
              "collection membership",
            ],
          }),
          breadcrumbJsonLd(CRUMBS),
        ]}
      />
      <PageBreadcrumbs crumbs={CRUMBS} />
      <header className="mb-8">
        <div className="h-1 w-16 rounded-full bg-holo-vivid" />
        <h1 className="mt-4 font-display text-3xl font-black sm:text-4xl">
          {PAGE_COPY.insights.heading}
        </h1>
        <p className="mt-2 text-[var(--foreground)]/65">
          A live count of what is actually for sale — not a trend survey, not
          scraped search volume.
        </p>
        <p className="mt-1 text-xs font-semibold text-[var(--foreground)]/45">
          Snapshot {generatedLabel} UTC
          {snapshot.activeProducts > 0
            ? ` · ${snapshot.activeProducts} active products`
            : " · catalog unavailable"}
        </p>
      </header>

      <article className="legal-prose">
        <h2>How this is counted</h2>
        <p>
          Every number on this page is a query against the same catalog the
          storefront uses. Active means <code>status = active</code>. MagSafe
          means the product carries the same <code>magsafe</code> tag the{" "}
          <Link href="/collections/magsafe">MagSafe collection</Link> filters
          on — applied only after the merchandising review described in{" "}
          <Link href="/blog/how-we-verify-magsafe">
            How we verify MagSafe
          </Link>
          . Character and brand rows are subtree-distinct product counts from
          the browse tree, so Hello Kitty is not double-counted as a second
          Sanrio total on this table (Sanrio is listed separately as the parent
          brand).
        </p>
        <p>
          We do not invent percentages, city pages, or &quot;Reddit&quot;
          URLs. If the catalog is empty (a local site with no database), the
          tables stay empty rather than showing placeholder marketing stats.
        </p>

        <h2>MagSafe share</h2>
        {snapshot.activeProducts > 0 ? (
          <p>
            {snapshot.magsafe} of {snapshot.activeProducts} active products are
            tagged MagSafe ({magShare == null ? "n/a" : `${magShare}%`}). The
            rest are sold as
            regular cases or accessories. Shop the tagged set on{" "}
            <Link href="/collections/magsafe">MagSafe phone cases</Link>, or
            all fits on <Link href="/devices/iphone">iPhone cases</Link>.
          </p>
        ) : (
          <p>No active products are loaded in this environment.</p>
        )}

        <h2>By product type</h2>
        {snapshot.byType.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Active products</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.byType.map((row) => (
                <tr key={row.id}>
                  <td>{row.label}</td>
                  <td>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No type breakdown until the catalog is connected.</p>
        )}

        <h2>By character and brand</h2>
        <p>
          Counts are distinct active products in that collection or any of its
          children. Use these links when a page already ranks for a looser
          query and should point at the money URL —{" "}
          <Link href="/collections/kuromi">Kuromi phone cases</Link>,{" "}
          <Link href="/collections/hello-kitty">Hello Kitty phone cases</Link>,{" "}
          <Link href="/collections/kawaii">kawaii phone cases</Link>.
        </p>
        {snapshot.collections.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Collection</th>
                <th>Kind</th>
                <th>Active products</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.collections.map((row) => (
                <tr key={row.slug}>
                  <td>
                    <Link href={`/collections/${row.slug}`}>{row.name}</Link>
                  </td>
                  <td>{row.kind}</td>
                  <td>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No stocked character or brand collections to list.</p>
        )}

        <h2>iPhone models we cut cases for</h2>
        <p>
          The selectable models on an iPhone case are not a ranking claim.
          They are the option axis on every iPhone product page:{" "}
          {IPHONE_MODELS.join(", ")}.
        </p>

        <h2>What this is not</h2>
        <ul>
          <li>Not search-volume keyword research.</li>
          <li>Not a claim about what other shops stock.</li>
          <li>
            Not MagSafe certification from Apple — it is our own catalog tag
            after review.
          </li>
        </ul>
      </article>

      <div className="mt-12">
        <PreferredSourceCard />
      </div>
    </div>
  );
}

import Link from "next/link";
import Image from "next/image";
import {
  getCollectionImagePools,
  getCollectionTree,
  type CollectionNode,
} from "@/lib/collections";
import { getDeviceFacetCounts, getMagsafeFacetCounts } from "@/lib/products";
import { MAGSAFE_FACETS, magsafeFacetHref } from "@/lib/catalog/magsafe";
import {
  allDevices,
  catalogHasMultipleDevices,
  deviceBrowseHref,
  deviceFilterLabel,
} from "@/lib/catalog/devices";
import { MAGNETIC_RING_SLUG, ORIGINALS_SLUG } from "@/lib/catalog/collections-config";
import {
  parseDirectorySort,
  sortDirectoryBrands,
} from "@/lib/catalog/directory-sort";
import { CollectionsBrowseBar } from "@/components/collections/CollectionsBrowseBar";
import { JsonLd } from "@/components/JsonLd";
import {
  breadcrumbJsonLd,
  collectionPageJsonLd,
  publicPageMetadata,
} from "@/lib/seo";
import { PAGE_COPY } from "@/lib/seo/copy";

/** Collection directory: never durable ISR. CDN caches the HTML. */
export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata({
  title: PAGE_COPY.collections.title,
  description: PAGE_COPY.collections.description,
  path: "/collections",
});

/**
 * Product count at which a brand earns a full card in the grid.
 *
 * A one-product brand and a forty-one-product brand were being given the same
 * footprint, which is both a merchandising lie and a waste of a screen: a
 * shopper scrolled past four near-empty cards to reach the collections that
 * actually have something to sell. Below this threshold a brand still ships —
 * it just ships as a pill in "More brands", where it costs one line instead of
 * one tile.
 *
 * Three is the smallest count that fills a row of the collection page's own
 * product grid, so it is also the point at which a card stops leading to a
 * page that looks empty.
 */
const CARD_MIN_PRODUCTS = 3;

/**
 * Card widths per breakpoint, matching the grid below (2 → 3 → 4 → 5 columns).
 * The container caps at 1800px, so the widest column is a fixed ~340px rather
 * than 20vw — telling the browser `20vw` on a 3440px monitor would have it
 * download a 688px-wide crop of a tile that is never wider than 340.
 */
const CARD_IMAGE_SIZES =
  "(max-width: 639px) 50vw, (max-width: 1023px) 33vw, (max-width: 1535px) 25vw, 340px";

/**
 * Cards whose art loads eagerly — sized to the widest first row (the 5 columns
 * of the `2xl` grid). These are above the fold on every viewport, and one of
 * them is always the LCP element, which the dev overlay was flagging because
 * the whole grid lazy-loaded.
 *
 * `loading="eager"` rather than `preload`: which card wins LCP depends on the
 * column count, and `preload` is documented as the wrong tool when the LCP
 * candidate is viewport-dependent — it would put a `<link>` in the head for art
 * a phone may never paint.
 */
const EAGER_CARDS = 5;

export default async function CollectionsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string | string[] }>;
}) {
  const [{ sort: sortParam }, tree, magsafeCounts, deviceCounts, imagePools] =
    await Promise.all([
      searchParams,
      getCollectionTree(),
      getMagsafeFacetCounts(),
      getDeviceFacetCounts(),
      getCollectionImagePools(),
    ]);
  const sort = parseDirectorySort(sortParam);
  const stockedDevices = allDevices().filter(
    (device) => (deviceCounts[device.id] ?? 0) > 0,
  );
  const showDevicePills = catalogHasMultipleDevices(deviceCounts);

  // Stocked-or-featured mirrors the header's rule, so the index never links to
  // a collection page the mega-menu has already hidden.
  const brands = tree.filter(
    (c) => c.kind === "brand" && (c.totalCount > 0 || c.featured),
  );
  const originals = tree.find((c) => c.slug === ORIGINALS_SLUG);
  const magneticRing = tree.find(
    (c) => c.slug === MAGNETIC_RING_SLUG && c.totalCount > 0,
  );

  // Split the shelf: brands with real depth get cards, the long tail gets pills.
  // If nothing clears the bar (a brand-new store, or a catalogue mid-import)
  // the split collapses back to a single grid — a page whose entire contents
  // are a row of pills reads as broken, and an empty grid above them reads
  // worse. Merchandised order is preserved on both sides.
  const deep = brands.filter((b) => b.totalCount >= CARD_MIN_PRODUCTS);
  const shallow = brands.filter((b) => b.totalCount < CARD_MIN_PRODUCTS);
  const split = deep.length > 0;
  const cards = sortDirectoryBrands(split ? deep : brands, sort);
  const pills = sortDirectoryBrands(split ? shallow : [], sort);

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-3 sm:px-6 sm:py-8">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Home", url: "/" },
            { name: "Collections", url: "/collections" },
          ]),
          collectionPageJsonLd({
            name: PAGE_COPY.collections.heading,
            description: PAGE_COPY.collections.description,
            url: "/collections",
            items: [
              ...(magneticRing
                ? [
                    {
                      name: magneticRing.name,
                      url: `/collections/${magneticRing.slug}`,
                    },
                  ]
                : []),
              ...brands
                .filter((brand) => brand.totalCount > 0)
                .map((brand) => ({
                  name: brand.name,
                  url: `/collections/${brand.slug}`,
                })),
            ],
          }),
        ]}
      />
      {/*
        One header block. When the catalog spans more than one product line
        (iPhone + AirPods), device is the first choice and MagSafe follows —
        MagSafe is meaningless on an AirPods case. An iPhone-only catalog
        keeps MagSafe as the opening axis, same as before.
      */}
      <header className="mb-3 sm:mb-8">
        <h1 className="text-xl font-black sm:text-3xl lg:text-4xl">
          {PAGE_COPY.collections.heading}
        </h1>
        <p className="mt-1.5 hidden max-w-2xl text-sm text-[var(--foreground)]/65 lg:mt-2 lg:block lg:text-base">
          {showDevicePills
            ? `Start with the device — ${stockedDevices.map((d) => d.label).join(" or ")} — then MagSafe for phone cases, then browse characters, original designs, and brands. Live SKU counts (not a survey) are on `
            : "Start with the fit — MagSafe or not — then browse characters, original designs, and brands. Live SKU counts (not a survey) are on "}
          <Link href="/insights" className="font-semibold text-[var(--primary)]">
            What&apos;s in the catalog
          </Link>
          .
        </p>
        <CollectionsBrowseBar
          devices={
            showDevicePills
              ? stockedDevices.map((device) => ({
                  id: device.id,
                  href: deviceBrowseHref(device, deviceCounts),
                  label: deviceFilterLabel(device.id),
                  icon: device.icon,
                  count: deviceCounts[device.id] ?? 0,
                }))
              : []
          }
          magsafe={MAGSAFE_FACETS.map((facet) => ({
            id: facet.id,
            href: magsafeFacetHref(facet.magsafe),
            label: facet.label,
            accentColor: facet.accentColor,
            count: facet.magsafe
              ? magsafeCounts.magsafe
              : magsafeCounts.nonMagsafe,
          }))}
          originals={
            originals && originals.totalCount > 0
              ? {
                  href: `/collections/${ORIGINALS_SLUG}`,
                  name: originals.name,
                  icon: originals.icon ?? "✨",
                  count: originals.totalCount,
                }
              : undefined
          }
          sort={sort}
        />
      </header>

      {magneticRing && (
        <section aria-labelledby="magnetic-ring-heading" className="mb-8 sm:mb-10">
          <h2 id="magnetic-ring-heading" className="mb-3 text-sm font-black sm:text-lg">
            Magnetic ring holder
          </h2>
          <Link
            href={`/collections/${MAGNETIC_RING_SLUG}`}
            className="group flex items-stretch overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[0_8px_24px_-20px_rgba(120,60,120,0.45)] transition hover:-translate-y-0.5 hover:border-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
          >
            <div className="relative aspect-square w-28 shrink-0 bg-[var(--product-surface)] sm:w-44">
              <CollectionPhoto
                src={imagePools.get(magneticRing.id)?.[0] ?? null}
                accent={magneticRing.accentColor}
                sizes="176px"
                eager
              />
            </div>
            <div className="flex min-w-0 flex-col justify-center p-4 sm:p-6">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--foreground)]/45">
                On the back of the case
              </p>
              <p className="mt-1 truncate text-lg font-black group-hover:text-[var(--primary)] sm:text-2xl">
                {magneticRing.name}
              </p>
              {magneticRing.description && (
                <p className="mt-1 line-clamp-2 max-w-xl text-sm text-[var(--foreground)]/65">
                  {magneticRing.description}
                </p>
              )}
              <p className="mt-2 text-xs font-semibold tabular-nums text-[var(--foreground)]/60">
                {countLabel(magneticRing.totalCount)}
              </p>
            </div>
          </Link>
        </section>
      )}

      {/* Characters & brands */}
      <section aria-labelledby="brands-heading">
        <h2 id="brands-heading" className="mb-3 text-sm font-black sm:text-lg">
          Characters &amp; brands
        </h2>
        {cards.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-5">
            {cards.map((brand, i) => (
              <BrandCard
                key={brand.slug}
                brand={brand}
                imageUrl={imagePools.get(brand.id)?.[0] ?? null}
                eager={i < EAGER_CARDS}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-center">
            <p className="text-lg font-bold">No character collections yet</p>
            <p className="mt-1 text-sm text-[var(--foreground)]/65">
              Run <code>npm run seed:collections</code> to set up the taxonomy.
            </p>
          </div>
        )}
      </section>

      {/*
        The long tail. These are real collections a shopper may be hunting for
        by name (Snoopy, Shin-chan), so they stay on the page and stay
        crawlable — they just stop pretending to be flagships.
      */}
      {pills.length > 0 && (
        <section aria-labelledby="more-brands-heading" className="mt-6 sm:mt-10">
          <h2
            id="more-brands-heading"
            className="mb-3 text-sm font-black sm:text-lg"
          >
            More brands
          </h2>
          <ul className="flex flex-wrap gap-2">
            {pills.map((brand) => (
              <li key={brand.slug}>
                <Link
                  href={`/collections/${brand.slug}`}
                  aria-label={accessibleName(brand)}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--primary)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: brand.accentColor ?? "var(--primary)" }}
                  />
                  {brand.name}
                  {brand.totalCount > 0 && (
                    <span className="text-xs font-bold tabular-nums text-[var(--foreground)]/45">
                      {brand.totalCount}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** "41 products" / "1 product" — the unit spelled out, for copy and for AT. */
function countLabel(total: number): string {
  return `${total} product${total === 1 ? "" : "s"}`;
}

/**
 * The link's accessible name. Built explicitly because the visible card packs
 * three fragments (name, count, a `•`-joined character list) that a screen
 * reader would otherwise run together — and because "41 products" is a better
 * thing to hear than "41" followed by nine bullet characters.
 */
function accessibleName(brand: CollectionNode): string {
  const base = `${brand.name} — ${countLabel(brand.totalCount)}`;
  if (brand.children.length === 0) return base;
  return `${base}, including ${brand.children.map((c) => c.name).join(", ")}`;
}

/**
 * One catalog tile. Every brand uses the same frame: a square crop of a real
 * listing photo, then a one-line name and a count. Character names stay in the
 * accessible name so a long roster cannot change the card height.
 */
function BrandCard({
  brand,
  imageUrl,
  eager = false,
}: {
  brand: CollectionNode;
  imageUrl: string | null;
  eager?: boolean;
}) {
  return (
    <Link
      href={`/collections/${brand.slug}`}
      aria-label={accessibleName(brand)}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[0_8px_24px_-20px_rgba(120,60,120,0.45)] transition duration-300 hover:-translate-y-1 hover:border-[var(--primary)] hover:shadow-[0_22px_45px_-22px_rgba(255,62,165,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
    >
      <div className="relative aspect-square shrink-0 bg-[var(--product-surface)]">
        <CollectionPhoto
          src={imageUrl}
          accent={brand.accentColor}
          sizes={CARD_IMAGE_SIZES}
          eager={eager}
        />
      </div>
      <div className="flex min-w-0 flex-col p-2.5 sm:p-3.5">
        <p className="truncate text-[15px] font-black leading-tight transition group-hover:text-[var(--primary)] sm:text-base">
          {brand.name}
        </p>
        <p className="mt-1 text-xs font-semibold tabular-nums text-[var(--foreground)]/60">
          {countLabel(brand.totalCount)}
        </p>
      </div>
    </Link>
  );
}

function CollectionPhoto({
  src,
  accent,
  sizes,
  eager = false,
}: {
  src: string | null;
  accent: string | null;
  sizes: string;
  eager?: boolean;
}) {
  if (!src) {
    return (
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `linear-gradient(160deg, ${accent ?? "var(--primary)"}, var(--product-surface))`,
        }}
      />
    );
  }
  return (
    <Image
      src={src}
      alt=""
      fill
      sizes={sizes}
      loading={eager ? "eager" : "lazy"}
      className="object-cover object-center transition duration-500 group-hover:scale-[1.03]"
    />
  );
}

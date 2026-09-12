import Link from "next/link";
import Image from "next/image";
import { getCollectionTree, type CollectionNode } from "@/lib/collections";
import { getMagsafeFacetCounts } from "@/lib/products";
import { MAGSAFE_FACETS, magsafeFacetHref } from "@/lib/catalog/magsafe";
import { ORIGINALS_SLUG } from "@/lib/catalog/collections-config";
import {
  COLLECTION_CARD_ART_SLUGS,
  collectionCardArtSrc,
} from "@/lib/brand/collection-card-art";
import { JsonLd } from "@/components/JsonLd";
import {
  breadcrumbJsonLd,
  collectionPageJsonLd,
  publicPageMetadata,
} from "@/lib/seo";
import { PAGE_COPY } from "@/lib/seo/copy";

export const revalidate = 3600;

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
const CARD_ART_SIZES =
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

export default async function CollectionsIndexPage() {
  const [tree, magsafeCounts] = await Promise.all([
    getCollectionTree(),
    getMagsafeFacetCounts(),
  ]);

  // Stocked-or-featured mirrors the header's rule, so the index never links to
  // a collection page the mega-menu has already hidden.
  const brands = tree.filter(
    (c) => c.kind === "brand" && (c.totalCount > 0 || c.featured),
  );
  const originals = tree.find((c) => c.slug === ORIGINALS_SLUG);

  // Split the shelf: brands with real depth get cards, the long tail gets pills.
  // If nothing clears the bar (a brand-new store, or a catalogue mid-import)
  // the split collapses back to a single grid — a page whose entire contents
  // are a row of pills reads as broken, and an empty grid above them reads
  // worse. Merchandised order is preserved on both sides.
  const deep = brands.filter((b) => b.totalCount >= CARD_MIN_PRODUCTS);
  const shallow = brands.filter((b) => b.totalCount < CARD_MIN_PRODUCTS);
  const split = deep.length > 0;
  const cards = split ? deep : brands;
  const pills = split ? shallow : [];

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 sm:py-8">
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
            items: brands
              .filter((brand) => brand.totalCount > 0)
              .map((brand) => ({
                name: brand.name,
                url: `/collections/${brand.slug}`,
              })),
          }),
        ]}
      />
      {/*
        One header block, not three. The page previously spent ~260px of the
        fold on a title, a description, a second heading and a second
        description that all said the same thing ("browse by MagSafe, then by
        character"). The compatibility choice is the page's primary axis, so it
        stays at the top — but as two pills directly under the sentence that
        introduces them, not as a section of its own.
      */}
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-black sm:text-3xl lg:text-4xl">
          {PAGE_COPY.collections.heading}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-[var(--foreground)]/65 sm:text-base">
          Start with the fit — MagSafe or not — then browse characters, original
          designs, and brands. Live SKU counts (not a survey) are on{" "}
          <Link href="/insights" className="font-semibold text-[var(--primary)]">
            What&apos;s in the catalog
          </Link>
          .
        </p>
        {/* Labelled landmark in place of the heading these pills used to sit
            under: the group is still announced and jumpable, without a heading
            whose only job was to caption two links. */}
        <nav
          aria-label="Shop by MagSafe compatibility"
          className="mt-3 flex flex-wrap gap-2"
        >
          {MAGSAFE_FACETS.map((facet) => {
            const count = facet.magsafe
              ? magsafeCounts.magsafe
              : magsafeCounts.nonMagsafe;
            return (
              <Link
                key={facet.id}
                href={magsafeFacetHref(facet.magsafe)}
                // The bare count reads as "MagSafe 128" to a screen reader, so
                // the accessible name spells the unit out.
                aria-label={
                  count > 0 ? `${facet.label} — ${count} products` : facet.label
                }
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-bold shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--primary)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: facet.accentColor }}
                />
                {facet.label}
                {count > 0 && (
                  <span className="text-xs font-bold tabular-nums text-[var(--foreground)]/45">
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
          {originals && originals.totalCount > 0 && (
            <Link
              href={`/collections/${ORIGINALS_SLUG}`}
              aria-label={`${originals.name} — ${originals.totalCount} products`}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-bold shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--primary)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
            >
              <span aria-hidden className="text-sm">
                {originals.icon ?? "✨"}
              </span>
              {originals.name}
              <span className="text-xs font-bold tabular-nums text-[var(--foreground)]/45">
                {originals.totalCount}
              </span>
            </Link>
          )}
        </nav>
      </header>

      {/* Characters & brands */}
      <section aria-labelledby="brands-heading">
        <h2 id="brands-heading" className="mb-3 text-base font-black sm:text-lg">
          Characters &amp; brands
        </h2>
        {cards.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-5">
            {cards.map((brand, i) => (
              <BrandCard key={brand.slug} brand={brand} eager={i < EAGER_CARDS} />
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
        <section aria-labelledby="more-brands-heading" className="mt-8 sm:mt-10">
          <h2
            id="more-brands-heading"
            className="mb-3 text-base font-black sm:text-lg"
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
 * An entry point into one character/brand collection.
 *
 * The card is built in four painted layers, bottom to top:
 *
 *   1. backdrop — either a generated, text-free pastel pixel field (Nano Banana
 *                 Pro; see `scripts/generate-collection-card-art.ts`) or, for
 *                 the collections without one, a wash of the brand's accent
 *   2. scrim    — white veils that hold the copy legible over layer 1; art only
 *   3. accent   — the brand's colour rule along the top edge
 *   4. copy     — name, product count and character list
 *
 * Layer 4 is wrapped in a positioned element on purpose: CSS paints in-flow
 * blocks *beneath* positioned descendants, so bare `<p>` children would end up
 * underneath the backdrop. A collection whose art file is missing simply takes
 * the accent wash instead, so the manifest going stale is a style difference
 * rather than a 404.
 *
 * ── Sizing ──────────────────────────────────────────────────────────────────
 * Two phones-worth of card per row, and a fixed 4:3 tile to hold them level:
 * a one-column stack of content-height cards gave a 10-brand catalogue a
 * 2,000px scroll and made Sanrio (nine characters) three times the height of
 * Miffy (none). From `sm` the aspect is released and a `min-h` floor takes
 * over, because a 4:3 tile in a 340px column would be 255px tall — the same
 * ballooning, just wider.
 *
 * ── Why one truncated line of characters, not chips ─────────────────────────
 * The chip row was the height bug: it wrapped, so a card's height was a
 * function of how many characters a brand happens to have and how wide the
 * viewport happens to be. One `truncate`d line is height-invariant by
 * construction. It is preferred to a `group-hover` reveal because hover does
 * not exist on touch — where most of this traffic is — and because revealing
 * content inside a card is a layout shift under the cursor. On mobile the line
 * is dropped entirely: at ~160px wide it could only ever show one-and-a-half
 * names, and the tap target is the brand, not the character.
 */
function BrandCard({
  brand,
  eager = false,
}: {
  brand: CollectionNode;
  eager?: boolean;
}) {
  const hasArt = COLLECTION_CARD_ART_SLUGS.has(brand.slug);
  const characters = brand.children.map((c) => c.name);
  const accent = brand.accentColor ?? "var(--primary)";
  return (
    <Link
      href={`/collections/${brand.slug}`}
      aria-label={accessibleName(brand)}
      className="group relative flex aspect-[4/3] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 pt-4 transition duration-300 hover:-translate-y-1 hover:border-[var(--primary)] hover:shadow-[0_22px_45px_-22px_rgba(255,62,165,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 sm:aspect-auto sm:min-h-32 sm:p-4 sm:pt-5"
    >
      {hasArt && (
        <>
          <Image
            src={collectionCardArtSrc(brand.slug)}
            alt=""
            fill
            sizes={CARD_ART_SIZES}
            loading={eager ? "eager" : "lazy"}
            className="object-cover transition duration-500 group-hover:scale-105"
          />
          {/*
            The scrim used to be weighted hard to the left (70/35/12), because
            the copy occupied the left third of a much taller card and the right
            two thirds were pure artwork. At this size the copy spans the whole
            tile — a truncated character line runs edge to edge — so a
            directional scrim leaves half of every string sitting on unprotected
            mascots. Two layers replace it: a near-uniform veil with a little
            diagonal falloff for depth, and a caption scrim along the bottom
            edge, where the character line would otherwise land on whichever
            mascot the generator happened to put there.

            Washing the art out was the stated risk of raising these numbers, and
            it is a real one at hero size. It is not the trade here: a 128px tile
            renders the mascots as pastel texture rather than as characters you
            can pick out, so the art's job is now colour and brand recognition,
            both of which survive a veil. Hover lifts the whole stack for anyone
            who wants a proper look.
          */}
          <div
            aria-hidden
            className="absolute inset-0 transition duration-500 group-hover:opacity-60"
          >
            <span className="absolute inset-0 bg-gradient-to-br from-white/85 via-white/68 to-white/52" />
            <span className="absolute inset-0 bg-gradient-to-t from-white/60 via-transparent to-transparent" />
          </div>
        </>
      )}
      {/*
        Only three collections have generated artwork, and a fixed-ratio tile
        makes that gap obvious in a way a content-height card did not: the rest
        were reading as blank boxes. This is the same accent wash the homepage
        `CategoryRail` falls back to when a cover is missing — the brand colour
        the top rule already declares, bled a little way into the tile.

        `color-mix` rather than an appended hex alpha because `accentColor` is
        nullable — `taxonomy-sync` writes `?? null` for any seed that omits one
        — and the fallback that resolves to is `var(--primary)`, which no
        appended alpha can express. `var(--primary)2e` is invalid, and one
        invalid stop drops the entire gradient.
      */}
      {!hasArt && (
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `linear-gradient(150deg, color-mix(in srgb, ${accent} 20%, transparent) 0%, color-mix(in srgb, ${accent} 7%, transparent) 45%, transparent 78%)`,
          }}
        />
      )}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ background: accent }}
      />
      {/* `min-w-0` so the truncated character line resolves against the card's
          width instead of its own intrinsic (unwrappable) length. */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <p className="line-clamp-2 text-[15px] font-black leading-tight transition group-hover:text-[var(--primary)] sm:text-base">
          {brand.name}
        </p>
        {/* /65 rather than the /45 this started at: the count now sits over
            artwork, and at /45 it missed WCAG AA even against plain white. */}
        <p className="mt-1 text-xs font-semibold text-[var(--foreground)]/65">
          {countLabel(brand.totalCount)}
        </p>
        {characters.length > 0 && (
          // Bottom-aligned so the character lines sit on a shared baseline
          // across a row. `aria-hidden` because the anchor's aria-label already
          // states this list in a form that reads as prose.
          <p
            aria-hidden
            className="mt-auto hidden truncate pt-3 text-xs font-semibold text-[var(--foreground)]/65 sm:block"
          >
            {characters.join(" • ")}
          </p>
        )}
      </div>
    </Link>
  );
}

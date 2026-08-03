import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getCollectionTree, type CollectionNode } from "@/lib/collections";
import { getMagsafeFacetCounts } from "@/lib/products";
import { MAGSAFE_FACETS, magsafeFacetHref } from "@/lib/catalog/magsafe";
import {
  COLLECTION_CARD_ART_SLUGS,
  collectionCardArtSrc,
} from "@/lib/brand/collection-card-art";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Collections",
  description:
    "Shop Y2KASE by MagSafe compatibility, or browse by character and brand — Sanrio, Miffy, Tamagotchi, anime and more.",
  alternates: { canonical: "/collections" },
};

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

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-10 sm:px-6">
      <header className="mb-10">
        <h1 className="text-3xl font-black sm:text-4xl">Collections</h1>
        <p className="mt-2 max-w-2xl text-[var(--foreground)]/65">
          Start with the fit — MagSafe or not — then browse your favourite
          characters and brands.
        </p>
      </header>

      {/* Compatibility: the primary axis, so it leads the page. */}
      <section className="mb-12">
        <h2 className="text-xl font-black">Shop by category</h2>
        <p className="mt-1 text-sm text-[var(--foreground)]/55">
          Filter the whole catalog by MagSafe compatibility.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
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
                className="inline-flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-5 py-2.5 text-sm font-bold shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--primary)] hover:text-[var(--primary)]"
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: facet.accentColor }}
                />
                {facet.label}
                {count > 0 && (
                  <span className="text-xs font-bold tabular-nums text-[var(--foreground)]/40">
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Characters & brands */}
      <section>
        <h2 className="mb-4 text-xl font-black">Characters &amp; brands</h2>
        {brands.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {brands.map((brand) => (
              <BrandCard key={brand.slug} brand={brand} />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--card)] p-12 text-center">
            <p className="text-lg font-bold">No character collections yet</p>
            <p className="mt-1 text-sm text-[var(--foreground)]/60">
              Run <code>npm run seed:collections</code> to set up the taxonomy.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * An entry point into one character/brand collection.
 *
 * The card is built in four painted layers, bottom to top:
 *
 *   1. artwork  — a generated, text-free pastel pixel field (Nano Banana Pro;
 *                 see `scripts/generate-collection-card-art.ts`)
 *   2. scrim    — a white gradient weighted to the copy side, the same
 *                 treatment the homepage hero uses over its art
 *   3. accent   — the brand's colour rule along the top edge
 *   4. copy     — name, product count and character chips
 *
 * Layer 4 is wrapped in a positioned element on purpose: CSS paints in-flow
 * blocks *beneath* positioned descendants, so bare `<p>` children would end up
 * underneath the artwork. Collections with no generated art skip layers 1–2 and
 * render on the plain card surface, so a missing file is a style difference
 * rather than a 404.
 *
 * No emoji or icons: this index is a wayfinding surface, and a wall of badges
 * competed for attention with the product photography one click away. Brand
 * identity now comes from the artwork and the accent rule instead.
 */
function BrandCard({ brand }: { brand: CollectionNode }) {
  const hasArt = COLLECTION_CARD_ART_SLUGS.has(brand.slug);
  return (
    <Link
      href={`/collections/${brand.slug}`}
      // min-h only bites on single-column mobile, where a childless card (Miffy,
      // Tamagotchi) would otherwise be too short to show any artwork. In the
      // multi-column grid every card already stretches past it.
      className="group relative flex min-h-28 flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 pt-6 transition hover:-translate-y-1 hover:border-[var(--primary)] hover:shadow-xl"
    >
      {hasArt && (
        <>
          <Image
            src={collectionCardArtSrc(brand.slug)}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition duration-500 group-hover:scale-105"
          />
          {/* Weighted to the left, where the name and count sit, and kept light:
              the artwork is already contrast-capped at generation time, so this
              only has to protect the copy and insure against a regenerated asset
              landing at the darker end of that budget. Heavier values (the 75/45
              /20 this started at) washed the mascots out to the point that the
              art read as noise. */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-r from-white/70 via-white/35 to-white/12"
          />
        </>
      )}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ background: brand.accentColor ?? "var(--primary)" }}
      />
      <div className="relative flex flex-1 flex-col">
        <p className="text-lg font-black transition group-hover:text-[var(--primary)]">
          {brand.name}
        </p>
        {/* /65 rather than the /45 this started at: the count now sits over
            artwork, and at /45 it missed WCAG AA even against plain white. */}
        <p className="mt-0.5 text-xs font-semibold text-[var(--foreground)]/65">
          {brand.totalCount} product{brand.totalCount === 1 ? "" : "s"}
        </p>
        {brand.children.length > 0 && (
          // Bottom-aligned so the chip rows line up across a grid row whose
          // cards have different numbers of characters.
          <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
            {brand.children.slice(0, 6).map((c) => (
              <span
                key={c.slug}
                className="rounded-full bg-[var(--muted)] px-2.5 py-1 text-xs font-semibold text-[var(--foreground)]/70"
              >
                {c.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

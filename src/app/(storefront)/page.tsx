import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { ArrowRight, Truck, ShieldCheck, Heart, Gift } from "lucide-react";
import {
  getFeaturedProducts,
  getCollectionRail,
  getDeviceFacetCounts,
  type ProductListItem,
} from "@/lib/products";
import { selectDiverseRail } from "@/lib/catalog/rail-mix";
import { getCollectionTree } from "@/lib/collections";
import { DEVICE_FAMILIES, deviceBrowseHref, deviceIsLive } from "@/lib/catalog/devices";
import { RAIL_HIDDEN_SLUGS } from "@/lib/catalog/collections-config";
import { BUNDLE } from "@/lib/promotions";
import { FREE_SHIPPING_OFFER } from "@/lib/pricing";
import { SHIPPING_COUNTRIES } from "@/lib/shipping";
import { DEVICE_COVER_IDS, deviceCoverSrc } from "@/lib/brand/device-covers";
import { ProductCard, PRODUCT_MOSAIC, PRODUCT_RAIL_ITEM } from "@/components/ProductCard";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { CategoryRail, type RailCategory } from "@/components/home/CategoryRail";
import { FeaturedEditorial } from "@/components/home/FeaturedEditorial";
import { PixelHeart, SparkleField, Wordmark } from "@/components/brand/Decor";
import { JsonLd } from "@/components/JsonLd";
import { organizationJsonLd, publicPageMetadata, websiteJsonLd } from "@/lib/seo";
import { PAGE_COPY } from "@/lib/seo/copy";

export const metadata: Metadata = publicPageMetadata({
  title: PAGE_COPY.home.title,
  description: PAGE_COPY.home.description,
  path: "/",
  absoluteTitle: true,
});

// Canonical homepage: durable ISR as a 24h safety net. Admin catalog edits
// invalidate on demand via `revalidateStorefrontListings`. Faceted listing
// URLs must not use this — each query string is a unique ISR write.
// Numeric literal required: Next.js cannot follow imported segment config.
export const revalidate = 86400;

export default async function HomePage() {
  // Over-fetch each collection so cross-rail de-dupe (Hello Kitty reserved
  // before Sanrio; Bestsellers reserved before all three) still leaves a full
  // 12-card mix. A pool of 24 was enough when every rail was newest-first;
  // type-aware merchandising concentrates the same SKUs at the front of every
  // parent/child pair, so Sanrio needs a deeper well.
  const RAIL_POOL = 48;
  const col = (slug: string) =>
    getCollectionRail(slug, RAIL_POOL).catch(() => [] as ProductListItem[]);

  const [featured, tree, sanrioItems, helloKittyItems, originalsItems, deviceCounts] =
    await Promise.all([
    getFeaturedProducts(8),
    getCollectionTree().catch(() => []),
    col("sanrio"),
    col("hello-kitty"),
    col("originals"),
    getDeviceFacetCounts().catch(() => undefined),
  ]);

  // ── Global product de-duplication + type mix ─────────────────────────────
  // No product should appear in more than one rail on the page. We reserve the
  // Hello Kitty section's items first, then fill the Sanrio rail with whatever
  // is left (which naturally surfaces other characters for variety).
  //
  // `selectDiverseRail` re-weaves whatever remains after that reservation so
  // skipping a few Hello Kitty iPhone cases (already in Bestsellers) cannot
  // collapse Sanrio/Originals into a single product type.
  const usedIds = new Set<number>(featured.map((p) => p.id));
  const pickDistinct = (items: ProductListItem[], n: number) => {
    const out = selectDiverseRail(items, {
      limit: n,
      usedIds,
      requireImage: true,
    });
    for (const p of out) usedIds.add(p.id);
    return out;
  };
  const helloKittyPicks = pickDistinct(helloKittyItems, 12);
  const originalsPicks = pickDistinct(originalsItems, 12);
  const sanrioPicks = pickDistinct(sanrioItems, 12);

  // Flatten the taxonomy (roots + character children), stocked collections
  // first, de-duplicated by slug. Each tile renders as a branded cover, so no
  // per-collection photo assignment is needed.
  const cats: RailCategory[] = [];
  const seen = new Set<string>();
  for (const node of tree) {
    for (const n of [node, ...node.children]) {
      if (seen.has(n.slug) || RAIL_HIDDEN_SLUGS.has(n.slug)) continue;
      seen.add(n.slug);
      cats.push({
        slug: n.slug,
        name: n.name,
        icon: n.icon,
        accent: n.accentColor,
        count: n.totalCount,
        kind: n.kind,
      });
    }
  }
  cats.sort(
    (a, b) => Number(b.count > 0) - Number(a.count > 0) || b.count - a.count,
  );
  const railCategories = cats.slice(0, 14);

  const devices = DEVICE_FAMILIES.flatMap((f) => f.devices).slice(0, 6);

  return (
    <div className="flex flex-col">
      <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
      <h1 className="sr-only">{PAGE_COPY.home.heading}</h1>

      {/* ── Hero (full viewport, rotatable) ───────────────────────────────── */}
      <HeroCarousel />

      {/* ── Shop the universe (category rail) ─────────────────────────────── */}
      <section className="defer-render mx-auto w-full max-w-[1800px] px-4 pt-14 sm:px-6">
        <SectionHeading
          eyebrow="Find your character"
          title="Shop the universe"
          href="/collections"
        />
        <CategoryRail categories={railCategories} />
      </section>

      {/* ── Featured collection (editorial) ───────────────────────────────── */}
      <section className="defer-render mx-auto w-full max-w-[1800px] px-4 pt-16 sm:px-6">
        <SectionHeading
          eyebrow="Editor's picks"
          title="Featured collection"
          href="/collections"
        />
        <FeaturedEditorial />
      </section>

      {/* ── Bestsellers ───────────────────────────────────────────────────── */}
      <section className="defer-render mx-auto w-full max-w-[1800px] px-4 pt-16 sm:px-6">
        <SectionHeading eyebrow="Most loved" title="Bestsellers" href="/products" />
        {featured.length > 0 ? (
          <div className={PRODUCT_MOSAIC}>
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </section>

      {/* ── Originals (no licensed character) ─────────────────────────────── */}
      <CollectionShowcase
        eyebrow="No character needed"
        title="Original designs"
        href="/collections/originals"
        accent="#7ec8ff"
        products={originalsPicks}
      />

      {/* ── Sanrio collection ─────────────────────────────────────────────── */}
      <CollectionShowcase
        eyebrow="Fan favourite"
        title="The Sanrio Collection"
        href="/collections/sanrio"
        accent="#ff7eb6"
        products={sanrioPicks}
      />

      {/* ── Hello Kitty spotlight ─────────────────────────────────────────── */}
      <CollectionShowcase
        eyebrow="Icon status"
        title="Hello Kitty Spotlight"
        href="/collections/hello-kitty"
        accent="#ff4d6d"
        products={helloKittyPicks}
      />

      {/* ── Shop by device ────────────────────────────────────────────────── */}
      <section className="defer-render mx-auto w-full max-w-[1800px] px-4 pt-16 sm:px-6">
        <SectionHeading eyebrow="Find your fit" title="Shop by device" href="/products" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {devices.map((d) => {
            const hasCover = DEVICE_COVER_IDS.has(d.id);
            return (
              <Link
                key={d.id}
                // Live devices have a dedicated, indexable landing page; others
                // fall back to the filtered catalog until they're stocked.
                href={deviceBrowseHref(d, deviceCounts)}
                className="group relative block overflow-hidden rounded-3xl border border-[var(--border)] shadow-[0_10px_30px_-22px_rgba(120,60,120,0.6)] transition duration-300 hover:-translate-y-1 hover:border-[var(--primary)] hover:shadow-[0_22px_45px_-24px_rgba(255,62,165,0.55)]"
              >
                {/* Themed device banner — the name is baked into the art
                    (matches the collection covers). */}
                <div className="relative aspect-video">
                  {hasCover ? (
                    <Image
                      src={deviceCoverSrc(d.id)}
                      alt={d.label}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                      className="object-cover transition duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center bg-holo p-3 text-center">
                      <span className="font-display text-base font-extrabold text-[var(--foreground)] sm:text-lg">
                        {d.label}
                      </span>
                    </span>
                  )}
                  {!deviceIsLive(d, deviceCounts) && (
                    <span className="absolute right-2 top-2 rounded-full bg-white/85 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--foreground)]/60 backdrop-blur-sm">
                      Soon
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Trust strip ───────────────────────────────────────────────────── */}
      <section className="defer-render mt-16 border-y border-[var(--border)] bg-[var(--card)]/60">
        <div className="mx-auto grid max-w-[1800px] grid-cols-1 gap-6 px-4 py-8 sm:grid-cols-3 sm:px-6">
          <Feature
            icon={<Truck className="h-5 w-5" />}
            title="Tracked international shipping"
            desc={`Delivery across ${SHIPPING_COUNTRIES.length} supported markets.`}
          />
          <Feature
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Drop-proof protection"
            desc="Cute, but seriously protective."
          />
          <Feature
            icon={<Heart className="h-5 w-5" />}
            title="Designed with love"
            desc="Curated Y2K & kawaii aesthetics."
          />
        </div>
      </section>

      {/* ── Y2KASE Club band ──────────────────────────────────────────────── */}
      <section className="defer-render mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <div className="relative overflow-hidden rounded-[2rem] border-2 border-white bg-holo-shimmer p-6 shadow-xl sm:rounded-[2.5rem] sm:p-10 lg:p-12">
          <div className="bg-grid absolute inset-0 opacity-40" />
          <SparkleField />
          {/* Single column until `lg`, so the copy + CTA always read first and
              the collage stacks underneath on phones and tablets. */}
          <div className="relative grid items-center gap-8 lg:grid-cols-2">
            <div>
              <p className="font-pixel text-[10px] uppercase text-[var(--primary)] sm:text-xs">
                ★ Members only
              </p>
              <h2 className="mt-3 font-display text-2xl font-extrabold sm:text-3xl lg:text-4xl">
                Join the <Wordmark className="text-xl sm:text-2xl lg:text-3xl" />{" "}
                Club
              </h2>

              {/* Headline offer. The strongest perk gets its own sticker badge
                  rather than a bullet, so it out-ranks the list visually.
                  Copy is derived from the promotions engine, so it stays in
                  lockstep with the cart banner and the featured card. */}
              <p className="sticker mt-4 text-xs sm:text-sm">
                <Gift className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
                <span className="text-[var(--primary)]">{BUNDLE.label}</span>
                <span className="font-semibold text-[var(--foreground)]/55">
                  · add any {BUNDLE.groupSize}
                </span>
              </p>

              <ul className="mt-4 space-y-2 text-sm text-[var(--foreground)]/80 sm:text-base">
                <ClubPerk>{FREE_SHIPPING_OFFER}</ClubPerk>
                <ClubPerk>Limited member-only discounts</ClubPerk>
                <ClubPerk>VIP tiers & birthday gifts</ClubPerk>
              </ul>
              {/* Full-bleed tap target on phones, natural width from `sm`. */}
              <Link
                href="/products"
                className="btn-candy mt-6 inline-flex w-full items-center justify-center gap-2 px-7 py-3.5 sm:mt-7 sm:w-auto"
              >
                <Gift className="h-4 w-4" /> Start shopping
              </Link>
            </div>
            <ClubHero />
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  href,
  accent,
}: {
  eyebrow: string;
  title: string;
  href: string;
  accent?: string;
}) {
  return (
    <div className="mb-7 flex items-end justify-between gap-4">
      <div>
        <p
          className="font-pixel text-[10px] uppercase tracking-tight"
          style={{ color: accent ?? "var(--primary)" }}
        >
          {eyebrow}
        </p>
        {/* Pixel-arcade title — the Y2KASE signature voice. */}
        <h2 className="mt-2.5 font-pixel text-base leading-[1.35] sm:text-lg lg:text-xl">
          {title}
        </h2>
      </div>
      <Link
        href={href}
        className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-[var(--primary)] hover:underline"
      >
        View all <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

/**
 * CollectionShowcase — an editorial horizontal product rail for a single
 * collection (e.g. Sanrio, Hello Kitty). Brand-skinned with an accent eyebrow;
 * renders nothing when the collection has no stocked products.
 */
function CollectionShowcase({
  eyebrow,
  title,
  href,
  accent,
  products,
}: {
  eyebrow: string;
  title: string;
  href: string;
  accent: string;
  products: ProductListItem[];
}) {
  if (!products || products.length === 0) return null;
  return (
    <section className="defer-render mx-auto w-full max-w-[1800px] px-4 pt-16 sm:px-6">
      <SectionHeading eyebrow={eyebrow} title={title} href={href} accent={accent} />
      <div className="-mx-4 flex items-stretch gap-4 overflow-x-auto px-4 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
        {products.slice(0, 12).map((product) => (
          <div key={product.id} className={PRODUCT_RAIL_ITEM}>
            <ProductCard product={product} />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * ClubHero — the membership band's visual: a single editorial still of the real
 * catalog cases, fanned with ribbon and confetti (generated from live product
 * photos via `npm run promos:generate`).
 *
 * Replaces the previous three fixed-width, absolutely-fanned product cards,
 * which measured ~432px against ~295px of usable width on a 375px phone and
 * were silently clipped by the band's `overflow-hidden`. A single
 * aspect-ratio-locked image scales fluidly at every breakpoint instead.
 */
function ClubHero() {
  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-sm overflow-hidden rounded-[1.5rem] border-2 border-white shadow-xl sm:max-w-md sm:rounded-[1.75rem] lg:max-w-none">
      <Image
        src="/brand/club-hero.webp"
        alt="A fan of Y2KASE phone cases with ribbon and confetti"
        fill
        sizes="(max-width: 1024px) 90vw, 45vw"
        className="object-cover"
      />
    </div>
  );
}

function ClubPerk({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 font-semibold">
      <PixelHeart className="h-4 w-4 shrink-0" />
      {children}
    </li>
  );
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-holo text-[var(--primary)]">
        {icon}
      </span>
      <div>
        <p className="font-bold">{title}</p>
        <p className="text-sm text-[var(--foreground)]/60">{desc}</p>
      </div>
    </div>
  );
}

function EmptyState() {
  const development = process.env.NODE_ENV === "development";
  return (
    <div className="card-cute border-dashed p-12 text-center">
      <p className="text-lg font-bold">
        {development ? "No products yet" : "Fresh picks are being updated"}
      </p>
      {development ? (
        <p className="mx-auto mt-1 max-w-md text-sm text-[var(--foreground)]/60">
          Configure your database and run{" "}
          <code className="rounded bg-[var(--muted)] px-1.5 py-0.5">
            npm run import:catalog
          </code>{" "}
          to load your catalog.
        </p>
      ) : (
        <>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--foreground)]/60">
            Our featured shelf is refreshing. The full catalog is still ready
            to browse.
          </p>
          <Link
            href="/products"
            className="btn-candy mt-5 inline-flex px-6 py-2.5 text-sm"
          >
            Shop all products
          </Link>
        </>
      )}
    </div>
  );
}

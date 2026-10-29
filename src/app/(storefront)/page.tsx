import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { ArrowRight, Gift } from "lucide-react";
import {
  getFeaturedProducts,
  getCollectionRail,
  getDeviceFacetCounts,
  type ProductListItem,
} from "@/lib/products";
import { selectDiverseRail } from "@/lib/catalog/rail-mix";
import { getCollectionTree } from "@/lib/collections";
import { DEVICE_FAMILIES, deviceBrowseHref, deviceIsLive } from "@/lib/catalog/devices";
import {
  RAIL_HIDDEN_SLUGS,
  orderRailCategories,
} from "@/lib/catalog/collections-config";
import { BUNDLE } from "@/lib/promotions";
import { FREE_SHIPPING_OFFER } from "@/lib/pricing";
import { DEVICE_COVER_IDS, deviceCoverSrc } from "@/lib/brand/device-covers";
import { ProductCard, PRODUCT_RAIL_ITEM } from "@/components/ProductCard";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { HomeReviewBand } from "@/components/home/HomeReviewBand";
import { CategoryRail, type RailCategory } from "@/components/home/CategoryRail";
import { BestsellerMarquee } from "@/components/home/BestsellerMarquee";
import { ScrollableProductRail } from "@/components/home/ScrollableProductRail";
import { FeaturedEditorial } from "@/components/home/FeaturedEditorial";
import { PixelHeart, SparkleField, Wordmark } from "@/components/brand/Decor";
import { JsonLd } from "@/components/JsonLd";
import { PurchaseAssurance } from "@/components/reviews/PurchaseAssurance";
import { TrustpilotQuote } from "@/components/reviews/TrustpilotQuote";
import { getStorefrontProof } from "@/lib/reviews";
import { organizationJsonLd, publicPageMetadata, websiteJsonLd } from "@/lib/seo";
import { PAGE_COPY } from "@/lib/seo/copy";

export const metadata: Metadata = publicPageMetadata({
  title: PAGE_COPY.home.title,
  description: PAGE_COPY.home.description,
  path: "/",
  absoluteTitle: true,
});

// Never durable ISR: Hobby writes are exhausted, so HTML is rendered on
// demand and held at the CDN (see next.config canonical headers).
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

function HomeSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-8 sm:px-6">
      <div className="h-[70vh] min-h-80 animate-pulse rounded-3xl bg-[var(--muted)]" />
      <div className="mt-8 h-8 w-56 animate-pulse rounded-full bg-[var(--muted)]" />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-2xl bg-[var(--muted)]"
          />
        ))}
      </div>
    </div>
  );
}

async function HomeContent() {
  // Over-fetch so de-dupe against Bestsellers still leaves a full Hello Kitty row.
  const RAIL_POOL = 48;
  const col = (slug: string) =>
    getCollectionRail(slug, RAIL_POOL).catch(() => [] as ProductListItem[]);

  const [featured, tree, helloKittyItems, deviceCounts, proof] =
    await Promise.all([
    getFeaturedProducts(),
    getCollectionTree().catch(() => []),
    col("hello-kitty"),
    getDeviceFacetCounts().catch(() => undefined),
    getStorefrontProof().catch(() => ({ lead: null, band: [] })),
  ]);

  // No product should appear in both Bestsellers and Hello Kitty Spotlight.
  // `selectDiverseRail` re-weaves what remains so skipping a few iPhone cases
  // cannot collapse the spotlight into a single product type.
  const usedIds = new Set<number>(featured.map((p) => p.id));
  const helloKittyPicks = selectDiverseRail(helloKittyItems, {
    limit: 12,
    usedIds,
    requireImage: true,
  });

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
  const railCategories = orderRailCategories(cats, 14);

  const homepageDevices = DEVICE_FAMILIES.flatMap((f) => f.devices).slice(0, 6);
  const liveDevices = homepageDevices.filter((d) => deviceIsLive(d, deviceCounts));
  const soonDevices = homepageDevices.filter((d) => !deviceIsLive(d, deviceCounts));

  return (
    <div className="flex flex-col">
      <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
      <h1 className="sr-only">{PAGE_COPY.home.heading}</h1>

      {/* ── Hero (full viewport, rotatable) ───────────────────────────────── */}
      <HeroCarousel />

      {/* ── Shop the universe (category rail) ─────────────────────────────── */}
      <section className="defer-render mx-auto w-full max-w-[1800px] px-4 pt-8 sm:px-6 sm:pt-14">
        <SectionHeading
          eyebrow="Find your character"
          title="Shop the universe"
          href="/collections"
        />
        <CategoryRail categories={railCategories} />
      </section>

      {/* ── Bestsellers — first thing a shopper can buy, on both layouts ─ */}
      <section className="defer-render mx-auto w-full max-w-[1800px] px-4 pt-10 sm:px-6 sm:pt-16">
        <SectionHeading eyebrow="Most loved" title="Bestsellers" href="/products" />
        {featured.length > 0 ? (
          // One row on every width. It drifts once the shelf is on screen.
          <BestsellerMarquee products={featured} />
        ) : (
          <EmptyState />
        )}
      </section>

      {proof.band.length > 0 && (
        <section className="defer-render mx-auto w-full max-w-[1800px] px-4 pt-8 sm:px-6 sm:pt-12">
          <SectionHeading eyebrow="From buyers" title="In real life" />
          <HomeReviewBand quotes={proof.band} />
        </section>
      )}

      {/* Full outside quote after the first cases and the buyer photos.
          A taller block here does not push the first product row down. */}
      <section className="defer-render mx-auto w-full max-w-[1800px] px-4 pt-10 sm:px-6 sm:pt-14">
        <TrustpilotQuote />
      </section>

      {/* ── Hello Kitty spotlight ─────────────────────────────────────────── */}
      <CollectionShowcase
        eyebrow="Icon status"
        title="Hello Kitty Spotlight"
        href="/collections/hello-kitty"
        accent="#ff4d6d"
        products={helloKittyPicks}
      />

      {/* ── Featured collection — the offer, after products are on screen ─ */}
      <section className="defer-render mx-auto w-full max-w-[1800px] px-4 pt-10 sm:px-6 sm:pt-16">
        <SectionHeading
          eyebrow="Editor's picks"
          title="Featured collection"
          href="/collections"
        />
        <FeaturedEditorial />
      </section>

      {/* ── Trust strip — policies after the shelves, before device browse ─ */}
      <section className="defer-render mx-auto w-full max-w-[1800px] px-4 pt-10 sm:px-6 sm:pt-16">
        <PurchaseAssurance variant="strip" />
      </section>

      {/* ── Shop by device — live lines as tiles, Soon as one chip row ──── */}
      <section className="defer-render mx-auto w-full max-w-[1800px] px-4 pt-10 sm:px-6 sm:pt-16">
        <SectionHeading eyebrow="Find your fit" title="Shop by device" href="/products" />
        {liveDevices.length > 0 && (
          <div className="grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {liveDevices.map((d) => {
              const hasCover = DEVICE_COVER_IDS.has(d.id);
              return (
                <Link
                  key={d.id}
                  href={deviceBrowseHref(d, deviceCounts)}
                  className="group relative block overflow-hidden rounded-3xl border border-[var(--border)] shadow-[0_10px_30px_-22px_rgba(120,60,120,0.6)] transition duration-300 hover:-translate-y-1 hover:border-[var(--primary)] hover:shadow-[0_22px_45px_-24px_rgba(255,62,165,0.55)]"
                >
                  <div className="relative aspect-video">
                    {hasCover ? (
                      <Image
                        src={deviceCoverSrc(d.id)}
                        alt={d.label}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
                        className="object-cover transition duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center bg-holo p-3 text-center">
                        <span className="font-display text-base font-extrabold text-[var(--foreground)] sm:text-lg">
                          {d.label}
                        </span>
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        {soonDevices.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {soonDevices.map((d) => (
              <li key={d.id}>
                <Link
                  href={deviceBrowseHref(d, deviceCounts)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white/70 px-3 py-1.5 text-xs font-bold text-[var(--foreground)]/70 transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                >
                  {d.label}
                  <span className="text-[9px] font-extrabold uppercase tracking-wide text-[var(--foreground)]/40">
                    Soon
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Y2KASE Club band ──────────────────────────────────────────────── */}
      <section className="defer-render mx-auto w-full max-w-[1800px] px-4 py-8 sm:px-6 sm:py-16">
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
  href?: string;
  accent?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4 sm:mb-7">
      <div>
        <p
          className="font-pixel text-[10px] uppercase tracking-tight"
          style={{ color: accent ?? "var(--primary)" }}
        >
          {eyebrow}
        </p>
        {/* Display face on a phone — the pixel cut wraps and is hard to scan
            at this size. The arcade voice stays on the eyebrow, and returns
            for the heading from `sm`. */}
        <h2 className="mt-1.5 text-[1.65rem] font-extrabold leading-[1.05] tracking-tight sm:mt-2.5 sm:font-pixel sm:text-lg sm:leading-[1.35] lg:text-xl">
          {title}
        </h2>
      </div>
      {href ? (
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-[var(--primary)] hover:underline"
        >
          View all <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}
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
  className = "",
}: {
  eyebrow: string;
  title: string;
  href: string;
  accent: string;
  products: ProductListItem[];
  className?: string;
}) {
  if (!products || products.length === 0) return null;
  return (
    <section
      className={`defer-render mx-auto w-full max-w-[1800px] px-4 pt-10 sm:px-6 sm:pt-16 ${className}`}
    >
      <SectionHeading eyebrow={eyebrow} title={title} href={href} accent={accent} />
      <ScrollableProductRail>
        {products.slice(0, 12).map((product) => (
          <div key={product.id} className={PRODUCT_RAIL_ITEM}>
            <ProductCard product={product} />
          </div>
        ))}
      </ScrollableProductRail>
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

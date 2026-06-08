import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { ArrowRight, Truck, ShieldCheck, Heart, Gift } from "lucide-react";
import {
  getFeaturedProducts,
  getCollectionRail,
  type ProductListItem,
} from "@/lib/products";
import { getCollectionTree, getCollectionImagePools } from "@/lib/collections";
import { DEVICE_FAMILIES } from "@/lib/catalog/devices";
import { ProductCard } from "@/components/ProductCard";
import { DeviceIcon } from "@/components/brand/DeviceIcon";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { CategoryRail, type RailCategory } from "@/components/home/CategoryRail";
import { FeaturedEditorial } from "@/components/home/FeaturedEditorial";
import { PixelHeart, SparkleField, Wordmark } from "@/components/brand/Decor";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// ISR: pre-render the homepage and refresh it hourly (matching the catalog,
// collection and PDP routes). Admin catalog edits invalidate it on demand via
// `revalidateTag`/`revalidatePath`, so the ~20 DB round-trips this page makes
// run at most once per hour instead of on every visit.
export const revalidate = 3600;

export default async function HomePage() {
  const col = (slug: string) =>
    getCollectionRail(slug).catch(() => [] as ProductListItem[]);

  const [
    featured,
    tree,
    pools,
    sanrioItems,
    helloKittyItems,
    myMelodyItems,
    cinnamorollItems,
  ] = await Promise.all([
    getFeaturedProducts(8),
    getCollectionTree().catch(() => []),
    getCollectionImagePools().catch(() => new Map<number, string[]>()),
    col("sanrio"),
    col("hello-kitty"),
    col("my-melody"),
    col("cinnamoroll"),
  ]);

  // ── Global product de-duplication ────────────────────────────────────────
  // No product should appear in more than one rail on the page. We reserve the
  // Hello Kitty section's items first, then fill the Sanrio rail with whatever
  // is left (which naturally surfaces other characters for variety).
  const usedIds = new Set<number>(featured.map((p) => p.id));
  const pickDistinct = (items: ProductListItem[], n: number) => {
    const out: ProductListItem[] = [];
    for (const p of items) {
      if (out.length >= n) break;
      if (usedIds.has(p.id) || !p.imageUrl) continue;
      usedIds.add(p.id);
      out.push(p);
    }
    return out;
  };
  const helloKittyPicks = pickDistinct(helloKittyItems, 12);
  const sanrioPicks = pickDistinct(sanrioItems, 12);

  // Club collage uses 3 DISTINCT real products from different characters.
  const clubPicks: ProductListItem[] = [];
  const clubSeen = new Set<number>();
  for (const arr of [
    helloKittyItems,
    myMelodyItems,
    cinnamorollItems,
    sanrioItems,
  ]) {
    if (clubPicks.length >= 3) break;
    const p = arr.find((x) => x.imageUrl && !clubSeen.has(x.id));
    if (p) {
      clubSeen.add(p.id);
      clubPicks.push(p);
    }
  }

  // Flatten the taxonomy (roots + character children), stocked collections
  // first. Keep each node's id so we can assign a representative photo.
  const nodes: { id: number; cat: RailCategory }[] = [];
  const seen = new Set<string>();
  for (const node of tree) {
    for (const n of [node, ...node.children]) {
      if (seen.has(n.slug)) continue;
      seen.add(n.slug);
      nodes.push({
        id: n.id,
        cat: {
          slug: n.slug,
          name: n.name,
          icon: n.icon,
          accent: n.accentColor,
          count: n.totalCount,
          kind: n.kind,
          thumb: null,
        },
      });
    }
  }
  nodes.sort(
    (a, b) =>
      Number(b.cat.count > 0) - Number(a.cat.count > 0) ||
      b.cat.count - a.cat.count,
  );
  const top = nodes.slice(0, 14);

  // Greedily assign a DISTINCT photo to each tile so no two categories repeat.
  const usedImages = new Set<string>();
  for (const { id, cat } of top) {
    const pool = pools.get(id) ?? [];
    const pick = pool.find((u) => !usedImages.has(u)) ?? pool[0] ?? null;
    if (pick) usedImages.add(pick);
    cat.thumb = pick;
  }
  const railCategories = top.map((t) => t.cat);

  const devices = DEVICE_FAMILIES.flatMap((f) => f.devices).slice(0, 6);

  return (
    <div className="flex flex-col">
      {/* ── Hero (full viewport, rotatable) ───────────────────────────────── */}
      <HeroCarousel />

      {/* ── Shop the universe (category rail) ─────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1800px] px-4 pt-14 sm:px-6">
        <SectionHeading
          eyebrow="Find your character"
          title="Shop the universe"
          href="/collections"
        />
        <CategoryRail categories={railCategories} />
      </section>

      {/* ── Featured collection (editorial) ───────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1800px] px-4 pt-16 sm:px-6">
        <SectionHeading
          eyebrow="Editor's picks"
          title="Featured collection"
          href="/collections"
        />
        <FeaturedEditorial />
      </section>

      {/* ── Bestsellers ───────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1800px] px-4 pt-16 sm:px-6">
        <SectionHeading eyebrow="Most loved" title="Bestsellers" href="/products" />
        {featured.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </section>

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
      <section className="mx-auto w-full max-w-[1800px] px-4 pt-16 sm:px-6">
        <SectionHeading eyebrow="Find your fit" title="Shop by device" href="/products" />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {devices.map((d) => (
            <Link
              key={d.id}
              // Live devices have a dedicated, indexable landing page; others
              // fall back to the filtered catalog until they're stocked.
              href={d.comingSoon ? `/products?device=${d.id}` : `/devices/${d.id}`}
              className="card-cute group flex flex-col items-center gap-2 p-4 text-center transition hover:-translate-y-1 hover:border-[var(--primary)]"
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-holo text-[var(--primary)] transition group-hover:scale-110">
                <DeviceIcon id={d.id} className="h-6 w-6" />
              </span>
              <span className="text-sm font-bold">{d.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Trust strip ───────────────────────────────────────────────────── */}
      <section className="mt-16 border-y border-[var(--border)] bg-[var(--card)]/60">
        <div className="mx-auto grid max-w-[1800px] grid-cols-1 gap-6 px-4 py-8 sm:grid-cols-3 sm:px-6">
          <Feature
            icon={<Truck className="h-5 w-5" />}
            title="Fast worldwide shipping"
            desc="Tracked delivery to your door."
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
      <section className="mx-auto w-full max-w-[1800px] px-4 py-16 sm:px-6">
        <div className="relative overflow-hidden rounded-[2.5rem] border-2 border-white bg-holo-shimmer p-8 shadow-xl sm:p-12">
          <div className="bg-grid absolute inset-0 opacity-40" />
          <SparkleField />
          <div className="relative grid items-center gap-8 lg:grid-cols-2">
            <div>
              <p className="font-pixel text-xs uppercase text-[var(--primary)]">
                ★ Members only
              </p>
              <h2 className="mt-3 font-display text-3xl font-extrabold sm:text-4xl">
                Join the <Wordmark className="text-2xl sm:text-3xl" /> Club
              </h2>
              <ul className="mt-5 space-y-2 text-[var(--foreground)]/80">
                <ClubPerk>Free shipping over $35</ClubPerk>
                <ClubPerk>Limited member-only discounts</ClubPerk>
                <ClubPerk>VIP tiers & birthday gifts</ClubPerk>
              </ul>
              <Link
                href="/products"
                className="btn-candy mt-7 inline-flex items-center gap-2 px-7 py-3.5"
              >
                <Gift className="h-4 w-4" /> Start shopping
              </Link>
            </div>
            <ClubCollage products={clubPicks} />
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
    <section className="mx-auto w-full max-w-[1800px] px-4 pt-16 sm:px-6">
      <SectionHeading eyebrow={eyebrow} title={title} href={href} accent={accent} />
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
        {products.slice(0, 12).map((product) => (
          <div key={product.id} className="w-40 shrink-0 sm:w-52">
            <ProductCard product={product} />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * ClubCollage — a fanned arrangement of REAL, distinct product photos for the
 * membership band. Using live catalog images (not an AI render) guarantees no
 * duplicated or made-up products.
 */
function ClubCollage({ products }: { products: ProductListItem[] }) {
  const cards = products.filter((p) => p.imageUrl).slice(0, 3);
  if (cards.length === 0) {
    return (
      <div className="relative aspect-[3/2] w-full overflow-hidden rounded-3xl border-2 border-white shadow-lg">
        <Image src="/brand/club.webp" alt="Y2KASE Club" fill sizes="45vw" className="object-cover" />
      </div>
    );
  }
  // Rotation + overlap per card position (left / centre / right).
  const styles =
    cards.length === 3
      ? ["-rotate-[8deg] z-10 translate-y-3", "rotate-[2deg] z-20 -mx-6", "rotate-[8deg] z-10 translate-y-3"]
      : cards.length === 2
        ? ["-rotate-[6deg] z-10", "rotate-[6deg] z-20 -ml-6"]
        : ["rotate-[2deg] z-20"];
  return (
    <div className="flex items-center justify-center py-4">
      {cards.map((p, i) => (
        <div key={p.id} className={`transition duration-300 ${styles[i]}`}>
          <div className="relative h-56 w-40 overflow-hidden rounded-[1.75rem] border-2 border-white bg-[var(--muted)] shadow-xl sm:h-64 sm:w-44">
            <Image
              src={p.imageUrl!}
              alt={p.title}
              fill
              sizes="176px"
              className="object-cover"
            />
          </div>
        </div>
      ))}
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
  return (
    <div className="card-cute border-dashed p-12 text-center">
      <p className="text-4xl">🚧</p>
      <p className="mt-3 text-lg font-bold">No products yet</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-[var(--foreground)]/60">
        Configure your database and run{" "}
        <code className="rounded bg-[var(--muted)] px-1.5 py-0.5">
          npm run import:catalog
        </code>{" "}
        to load your catalog.
      </p>
    </div>
  );
}

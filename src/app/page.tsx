import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Truck, ShieldCheck, Heart, Gift } from "lucide-react";
import { getFeaturedProducts } from "@/lib/products";
import { getCollectionTree, getCollectionThumbnails } from "@/lib/collections";
import { DEVICE_FAMILIES } from "@/lib/catalog/devices";
import { ProductCard } from "@/components/ProductCard";
import { DeviceIcon } from "@/components/brand/DeviceIcon";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { CategoryRail, type RailCategory } from "@/components/home/CategoryRail";
import { FeaturedEditorial } from "@/components/home/FeaturedEditorial";
import { PixelHeart, SparkleField, Wordmark } from "@/components/brand/Decor";

export default async function HomePage() {
  const [featured, tree, thumbs] = await Promise.all([
    getFeaturedProducts(8),
    getCollectionTree().catch(() => []),
    getCollectionThumbnails().catch(() => new Map<number, string>()),
  ]);

  // Flatten the taxonomy (roots + character children) into a single rail,
  // surfacing stocked collections first, then any featured-but-empty ones.
  const flat: RailCategory[] = [];
  const seen = new Set<string>();
  for (const node of tree) {
    for (const n of [node, ...node.children]) {
      if (seen.has(n.slug)) continue;
      seen.add(n.slug);
      flat.push({
        slug: n.slug,
        name: n.name,
        icon: n.icon,
        accent: n.accentColor,
        count: n.totalCount,
        kind: n.kind,
        thumb: thumbs.get(n.id) ?? null,
      });
    }
  }
  const railCategories = flat
    .sort((a, b) => Number(b.count > 0) - Number(a.count > 0) || b.count - a.count)
    .slice(0, 14);

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

      {/* ── Shop by device ────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-[1800px] px-4 pt-16 sm:px-6">
        <SectionHeading eyebrow="Find your fit" title="Shop by device" href="/products" />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {devices.map((d) => (
            <Link
              key={d.id}
              href={`/products?device=${d.id}`}
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
            <div className="relative mx-auto w-full max-w-sm">
              <div className="overflow-hidden rounded-3xl border-2 border-white shadow-lg">
                <Image
                  src="/brand/club.png"
                  alt="Welcome to the Y2KASE Club"
                  width={700}
                  height={875}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
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
}: {
  eyebrow: string;
  title: string;
  href: string;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <p className="font-pixel text-[10px] uppercase tracking-tight text-[var(--primary)]">
          {eyebrow}
        </p>
        <h2 className="mt-1.5 font-display text-2xl font-extrabold sm:text-3xl">
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

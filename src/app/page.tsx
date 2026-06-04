import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Truck, ShieldCheck, Heart, Gift } from "lucide-react";
import { getFeaturedProducts } from "@/lib/products";
import { getCollectionTree } from "@/lib/collections";
import { DEVICE_FAMILIES } from "@/lib/catalog/devices";
import { ProductCard } from "@/components/ProductCard";
import {
  Sparkle,
  PixelHeart,
  Sticker,
  SparkleField,
  Wordmark,
} from "@/components/brand/Decor";

export default async function HomePage() {
  const [featured, tree] = await Promise.all([
    getFeaturedProducts(8),
    getCollectionTree().catch(() => []),
  ]);
  const brands = tree
    .filter((c) => c.kind === "brand" && (c.totalCount > 0 || c.featured))
    .slice(0, 6);
  const devices = DEVICE_FAMILIES.flatMap((f) => f.devices).slice(0, 6);

  return (
    <div className="flex flex-col">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-20">
          <div className="animate-float-up">
            <Sticker className="font-pixel text-[10px] uppercase tracking-tight">
              <Sparkle className="h-3 w-3 text-[var(--primary)]" /> Welcome to the
              Club, bestie
            </Sticker>
            <h1 className="mt-5 font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
              Cases that match{" "}
              <span className="text-holo">your vibe</span>.
            </h1>
            <p className="mt-5 max-w-md text-lg text-[var(--foreground)]/70">
              Kawaii, Y2K & holographic phone cases, charms and accessories —
              designed to make every glance at your phone a little cuter. ✨
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/products"
                className="btn-candy inline-flex items-center gap-2 px-7 py-3.5 text-base"
              >
                Shop the collection <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/collections"
                className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--border)] bg-[var(--card)] px-6 py-3 font-bold transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
              >
                Browse characters
              </Link>
            </div>
            <div className="mt-7 flex flex-wrap gap-2">
              <Sticker>
                <Truck className="h-3.5 w-3.5 text-[var(--primary)]" /> Free ship
                over $35
              </Sticker>
              <Sticker>
                <Heart className="h-3.5 w-3.5 fill-[var(--primary)] text-[var(--primary)]" />{" "}
                Good vibes
              </Sticker>
              <Sticker>
                <Sparkle className="h-3.5 w-3.5 text-[var(--accent)]" /> Stay cute
              </Sticker>
            </div>
          </div>

          {/* Brand key art */}
          <div className="relative">
            <SparkleField />
            <div className="relative mx-auto aspect-[16/10] w-full max-w-xl overflow-hidden rounded-[2.5rem] border-2 border-white bg-holo-shimmer shadow-2xl">
              <div className="bg-grid absolute inset-0 opacity-50" />
              <Image
                src="/brand/logo.png"
                alt="Y2KASE — kawaii Y2K phone cases"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="animate-bob object-contain p-3"
              />
            </div>
            <div className="absolute -left-3 top-6 animate-bob">
              <PixelHeart className="h-9 w-9 drop-shadow" />
            </div>
            <div
              className="absolute -right-2 bottom-8 animate-bob"
              style={{ animationDelay: "1.5s" }}
            >
              <PixelHeart className="h-7 w-7 drop-shadow" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust strip ───────────────────────────────────────────────────── */}
      <section className="border-y border-[var(--border)] bg-[var(--card)]/60">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-8 sm:grid-cols-3 sm:px-6">
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

      {/* ── Shop by device ────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-7xl px-4 pt-14 sm:px-6">
        <SectionHeading
          eyebrow="Find your fit"
          title="Shop by device"
          href="/collections"
        />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {devices.map((d) => (
            <Link
              key={d.id}
              href={`/products?device=${d.id}`}
              className="card-cute group flex flex-col items-center gap-2 p-4 text-center transition hover:-translate-y-1 hover:border-[var(--primary)]"
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-holo text-2xl transition group-hover:scale-110">
                {d.icon}
              </span>
              <span className="text-sm font-bold">{d.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Shop by character ─────────────────────────────────────────────── */}
      {brands.length > 0 && (
        <section className="mx-auto w-full max-w-7xl px-4 pt-14 sm:px-6">
          <SectionHeading
            eyebrow="Your faves"
            title="Shop by character"
            href="/collections"
          />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {brands.map((b) => (
              <Link
                key={b.slug}
                href={`/collections/${b.slug}`}
                className="card-cute group relative flex flex-col items-center gap-2 overflow-hidden p-5 text-center transition hover:-translate-y-1"
              >
                <span
                  className="absolute inset-x-0 top-0 h-1.5"
                  style={{ background: b.accentColor ?? "var(--primary)" }}
                />
                <span
                  className="grid h-14 w-14 place-items-center rounded-2xl text-3xl transition group-hover:scale-110"
                  style={{ background: `${b.accentColor ?? "#ff3ea5"}22` }}
                >
                  {b.icon ?? "✨"}
                </span>
                <span className="font-display font-extrabold group-hover:text-[var(--primary)]">
                  {b.name}
                </span>
                <span className="text-xs font-semibold text-[var(--foreground)]/45">
                  {b.totalCount} item{b.totalCount === 1 ? "" : "s"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Bestsellers ───────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6">
        <SectionHeading
          eyebrow="Most loved"
          title="Bestsellers"
          href="/products"
        />
        {featured.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </section>

      {/* ── Y2KASE Club band ──────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">
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

import Link from "next/link";
import { ArrowRight, Sparkles, Truck, ShieldCheck, Heart } from "lucide-react";
import { getFeaturedProducts, getPopularTags } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";

export default async function HomePage() {
  const [featured, tags] = await Promise.all([
    getFeaturedProducts(8),
    getPopularTags(10),
  ]);

  return (
    <div className="flex flex-col">
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div className="animate-float-up">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--muted)] px-3 py-1 text-sm font-semibold text-[var(--primary)]">
              <Sparkles className="h-4 w-4" /> New drops every week
            </span>
            <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
              Cases that match{" "}
              <span className="text-[var(--primary)]">your vibe</span>.
            </h1>
            <p className="mt-4 max-w-md text-lg text-[var(--foreground)]/70">
              Kawaii, Y2K, and aesthetic phone cases, charms, and accessories —
              designed to make every glance at your phone a little cuter. ✨
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/products"
                className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-6 py-3 font-bold text-white transition hover:opacity-90"
              >
                Shop the collection <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/products?tag=magsafe_case"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-6 py-3 font-bold transition hover:border-[var(--primary)]"
              >
                MagSafe ready
              </Link>
            </div>
          </div>
          <div className="relative">
            <div className="aspect-square rotate-3 rounded-[2.5rem] bg-gradient-to-br from-pink-200 via-fuchsia-200 to-violet-200 shadow-2xl" />
            <div className="absolute inset-0 grid place-items-center text-[10rem]">
              🎀
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--card)]/50">
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

      {tags.length > 0 && (
        <section className="mx-auto w-full max-w-7xl px-4 pt-12 sm:px-6">
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Link
                key={tag}
                href={`/products?tag=${encodeURIComponent(tag)}`}
                className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-semibold capitalize transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
              >
                {tag.replace(/_/g, " ")}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="text-2xl font-black sm:text-3xl">Bestsellers</h2>
          <Link
            href="/products"
            className="inline-flex items-center gap-1 text-sm font-bold text-[var(--primary)]"
          >
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

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
    </div>
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
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--muted)] text-[var(--primary)]">
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
    <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--card)] p-12 text-center">
      <p className="text-4xl">🚧</p>
      <p className="mt-3 text-lg font-bold">No products yet</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-[var(--foreground)]/60">
        Configure your database and run{" "}
        <code className="rounded bg-[var(--muted)] px-1.5 py-0.5">
          npm run import:catalog
        </code>{" "}
        to load your catalog, or{" "}
        <code className="rounded bg-[var(--muted)] px-1.5 py-0.5">
          npm run ingest:images
        </code>{" "}
        to generate products from images with AI.
      </p>
    </div>
  );
}

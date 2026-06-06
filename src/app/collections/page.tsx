import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { getCollectionTree, type CollectionNode } from "@/lib/collections";
import { DEVICE_FAMILIES } from "@/lib/catalog/devices";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Collections",
  description:
    "Browse Y2KASE by character, brand and theme — Sanrio, Miffy, Tamagotchi, anime and more.",
  alternates: { canonical: "/collections" },
};

export default async function CollectionsIndexPage() {
  const tree = await getCollectionTree();
  const visible = tree.filter((c) => c.totalCount > 0 || c.featured);
  const brands = visible.filter((c) => c.kind === "brand");
  const genres = visible.filter((c) => c.kind === "genre");

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-10 sm:px-6">
      <header className="mb-10">
        <h1 className="text-3xl font-black sm:text-4xl">Collections</h1>
        <p className="mt-2 max-w-2xl text-[var(--foreground)]/65">
          Find your favorite characters, brands and aesthetics — then shop the
          perfect case for your device.
        </p>
      </header>

      {/* Devices */}
      <section className="mb-12">
        <h2 className="mb-4 text-xl font-black">Shop by device</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {DEVICE_FAMILIES.flatMap((f) => f.devices).map((d) => (
            <Link
              key={d.id}
              href={d.comingSoon ? `/products?device=${d.id}` : `/devices/${d.id}`}
              className="card-cute group flex flex-col items-center gap-2 p-4 text-center transition hover:-translate-y-1 hover:border-[var(--primary)]"
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-holo text-2xl transition group-hover:scale-110">
                {d.icon}
              </span>
              <span className="text-sm font-bold">{d.label}</span>
              {d.comingSoon && (
                <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--foreground)]/40">
                  Soon
                </span>
              )}
            </Link>
          ))}
        </div>
      </section>

      {/* Brands / characters */}
      {brands.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-xl font-black">Characters & brands</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {brands.map((brand) => (
              <BrandCard key={brand.slug} brand={brand} />
            ))}
          </div>
        </section>
      )}

      {/* Genres */}
      {genres.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-black">Shop by category</h2>
          <div className="flex flex-wrap gap-2">
            {genres.map((g) => (
              <Link
                key={g.slug}
                href={`/collections/${g.slug}`}
                className="rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-semibold transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
              >
                <span className="mr-1">{g.icon ?? "🏷️"}</span>
                {g.name}
                {g.totalCount > 0 && (
                  <span className="ml-1.5 text-[var(--foreground)]/40">
                    {g.totalCount}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {visible.length === 0 && (
        <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--card)] p-12 text-center">
          <p className="text-4xl">🧸</p>
          <p className="mt-3 text-lg font-bold">No collections yet</p>
          <p className="mt-1 text-sm text-[var(--foreground)]/60">
            Run <code>npm run seed:collections</code> to set up the taxonomy.
          </p>
        </div>
      )}
    </div>
  );
}

function BrandCard({ brand }: { brand: CollectionNode }) {
  const accent = brand.accentColor ?? "var(--primary)";
  return (
    <Link
      href={`/collections/${brand.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:-translate-y-1 hover:shadow-xl"
    >
      <div
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ background: accent }}
      />
      <div className="flex items-center gap-3">
        <span
          className="grid h-12 w-12 place-items-center rounded-2xl text-2xl"
          style={{ background: `${accent}22` }}
        >
          {brand.icon ?? "✨"}
        </span>
        <div>
          <p className="text-lg font-black group-hover:text-[var(--primary)]">
            {brand.name}
          </p>
          <p className="text-xs font-semibold text-[var(--foreground)]/45">
            {brand.totalCount} product{brand.totalCount === 1 ? "" : "s"}
          </p>
        </div>
        <ArrowRight className="ml-auto h-5 w-5 text-[var(--foreground)]/30 transition group-hover:translate-x-1 group-hover:text-[var(--primary)]" />
      </div>
      {brand.children.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
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
    </Link>
  );
}

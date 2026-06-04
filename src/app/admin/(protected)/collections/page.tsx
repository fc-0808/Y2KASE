import type { Metadata } from "next";
import Link from "next/link";
import { Star, ExternalLink, Filter } from "lucide-react";
import { isDbConfigured } from "@/lib/db";
import { getAllCollections, getCollectionCounts } from "@/lib/collections";
import type { Collection } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Admin · Collections" };
export const dynamic = "force-dynamic";

const KIND_STYLES: Record<string, string> = {
  brand: "bg-fuchsia-100 text-fuchsia-700",
  character: "bg-pink-100 text-pink-700",
  genre: "bg-amber-100 text-amber-700",
  feature: "bg-sky-100 text-sky-700",
};

export default async function AdminCollectionsPage() {
  if (!isDbConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Database not configured</h1>
      </div>
    );
  }

  const [all, counts] = await Promise.all([
    getAllCollections(),
    getCollectionCounts(),
  ]);

  // Build a depth-ordered flat list (parents before children).
  const childrenOf = new Map<number | null, Collection[]>();
  for (const c of all) {
    const key = c.parentId ?? null;
    const arr = childrenOf.get(key) ?? [];
    arr.push(c);
    childrenOf.set(key, arr);
  }
  for (const arr of childrenOf.values()) {
    arr.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  }
  const ordered: { c: Collection; depth: number }[] = [];
  const seen = new Set<number>();
  function walk(parentId: number | null, depth: number) {
    for (const c of childrenOf.get(parentId) ?? []) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      ordered.push({ c, depth });
      walk(c.id, depth + 1);
    }
  }
  walk(null, 0);
  // Orphans (parent missing) at root.
  for (const c of all)
    if (!seen.has(c.id)) ordered.push({ c, depth: 0 });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Collections</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--foreground)]/60">
            The browse taxonomy (characters, brands & themes). The tree is
            defined in code (<code>collections-config.ts</code>) and synced with{" "}
            <code>npm run seed:collections</code>. Assign products from the{" "}
            <Link href="/admin/products" className="text-[var(--primary)] hover:underline">
              Products
            </Link>{" "}
            console.
          </p>
        </div>
        <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-sm font-semibold">
          {all.length} collections
        </span>
      </div>

      {ordered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--card)] p-12 text-center">
          <p className="text-4xl">🧸</p>
          <p className="mt-3 text-lg font-bold">No collections yet</p>
          <p className="mt-1 text-sm text-[var(--foreground)]/60">
            Run <code>npm run db:collections</code> then{" "}
            <code>npm run seed:collections</code> to create the taxonomy.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
          <ul className="divide-y divide-[var(--border)]">
            {ordered.map(({ c, depth }) => {
              const count = counts.get(c.id) ?? 0;
              return (
                <li
                  key={c.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--muted)]/40"
                  style={{ paddingLeft: `${16 + depth * 24}px` }}
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg"
                    style={{
                      background: c.accentColor
                        ? `${c.accentColor}22`
                        : "var(--muted)",
                    }}
                  >
                    {c.icon ?? "🏷️"}
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-semibold">
                      {c.name}
                      {c.featured && (
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      )}
                      {c.status !== "active" && (
                        <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-600">
                          {c.status}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-[var(--foreground)]/50">
                      /{c.slug}
                    </p>
                  </div>
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      KIND_STYLES[c.kind] ?? "bg-[var(--muted)]"
                    }`}
                  >
                    {c.kind}
                  </span>
                  <span className="ml-auto text-sm font-semibold text-[var(--foreground)]/70">
                    {count} product{count === 1 ? "" : "s"}
                  </span>
                  <Link
                    href={`/admin/products?collection=${c.id}`}
                    title="Filter products in this collection"
                    className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--muted)]"
                  >
                    <Filter className="h-4 w-4" />
                  </Link>
                  <Link
                    href={`/collections/${c.slug}`}
                    target="_blank"
                    title="View on storefront"
                    className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--muted)]"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

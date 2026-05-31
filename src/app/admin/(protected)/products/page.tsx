import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getProductsByStatus } from "@/lib/products";
import { formatPrice } from "@/lib/utils";
import { isDbConfigured } from "@/lib/db";
import {
  publishProduct,
  unpublishProduct,
  deleteProduct,
  setFeatured,
} from "./actions";

export const metadata: Metadata = { title: "Admin · Products" };
export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  if (!isDbConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Database not configured</h1>
        <p className="mt-2 text-[var(--foreground)]/60">
          Add <code>DATABASE_URL</code> to <code>.env.local</code> to use the
          admin panel.
        </p>
      </div>
    );
  }

  const [drafts, active] = await Promise.all([
    getProductsByStatus("draft"),
    getProductsByStatus("active"),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-black">Product Admin</h1>
        <p className="mt-1 text-sm text-[var(--foreground)]/60">
          Review AI-generated drafts, then publish to the storefront.
        </p>
      </div>

      <section className="mb-12">
        <h2 className="mb-4 text-xl font-bold">
          Drafts pending review{" "}
          <span className="text-[var(--primary)]">({drafts.length})</span>
        </h2>
        {drafts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--foreground)]/60">
            No drafts. Run{" "}
            <code className="rounded bg-[var(--muted)] px-1.5 py-0.5">
              npm run ingest:images
            </code>{" "}
            to generate products from images.
          </p>
        ) : (
          <div className="space-y-3">
            {drafts.map((p) => (
              <AdminRow key={p.id} product={p} isDraft />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">
          Live products{" "}
          <span className="text-[var(--primary)]">({active.length})</span>
        </h2>
        <div className="space-y-3">
          {active.map((p) => (
            <AdminRow key={p.id} product={p} isDraft={false} />
          ))}
        </div>
      </section>
    </div>
  );
}

function AdminRow({
  product,
  isDraft,
}: {
  product: {
    id: number;
    slug: string;
    title: string;
    price: string;
    currency: string;
    imageUrl: string | null;
    featured: boolean;
  };
  isDraft: boolean;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[var(--muted)]">
        {product.imageUrl && (
          <Image
            src={product.imageUrl}
            alt={product.title}
            fill
            sizes="64px"
            className="object-cover"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 font-semibold">{product.title}</p>
        <p className="text-sm text-[var(--foreground)]/60">
          {formatPrice(product.price, product.currency)} · /{product.slug}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={`/products/${product.slug}`}
          className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-semibold hover:border-[var(--primary)]"
        >
          View
        </Link>

        {isDraft ? (
          <form action={publishProduct.bind(null, product.id)}>
            <button className="rounded-full bg-[var(--primary)] px-3 py-1.5 text-sm font-bold text-white">
              Publish
            </button>
          </form>
        ) : (
          <>
            <form
              action={setFeatured.bind(null, product.id, !product.featured)}
            >
              <button
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                  product.featured
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--border)] hover:border-[var(--accent)]"
                }`}
              >
                {product.featured ? "★ Featured" : "☆ Feature"}
              </button>
            </form>
            <form action={unpublishProduct.bind(null, product.id)}>
              <button className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-semibold hover:border-[var(--primary)]">
                Unpublish
              </button>
            </form>
          </>
        )}

        <form action={deleteProduct.bind(null, product.id)}>
          <button className="rounded-full px-3 py-1.5 text-sm font-semibold text-red-500 hover:bg-red-50">
            Delete
          </button>
        </form>
      </div>
    </div>
  );
}

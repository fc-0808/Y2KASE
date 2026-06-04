import type { Metadata } from "next";
import { getAdminProductOverviews } from "@/lib/products";
import { getAdminCollectionOptions } from "@/lib/collections";
import { isDbConfigured } from "@/lib/db";
import { ProductsConsole } from "./ProductsConsole";

export const metadata: Metadata = { title: "Admin · Products" };
export const dynamic = "force-dynamic";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ collection?: string }>;
}) {
  const sp = await searchParams;
  const initialCollectionId = sp.collection ? Number(sp.collection) : undefined;
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

  const [products, collectionOptions] = await Promise.all([
    getAdminProductOverviews(),
    getAdminCollectionOptions(),
  ]);

  return (
    <ProductsConsole
      products={products}
      collectionOptions={collectionOptions}
      initialCollectionId={initialCollectionId}
    />
  );
}

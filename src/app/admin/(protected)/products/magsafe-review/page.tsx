import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db, isDbConfigured } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { MagSafeReview } from "./MagSafeReview";

export const metadata: Metadata = { title: "Admin · MagSafe review" };
export const dynamic = "force-dynamic";

export default async function MagsafeReviewPage() {
  if (!isDbConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Database not configured</h1>
      </div>
    );
  }

  const rows = await db.query.products.findMany({
    where: eq(products.needsMagsafeReview, true),
    columns: {
      id: true,
      slug: true,
      title: true,
      price: true,
      currency: true,
      status: true,
    },
    with: {
      images: {
        columns: { url: true, position: true },
        orderBy: (img, { asc }) => asc(img.position),
        limit: 1,
      },
    },
    orderBy: desc(products.createdAt),
    limit: 500,
  });

  const items = rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    price: p.price,
    currency: p.currency,
    status: p.status,
    imageUrl: p.images[0]?.url ?? null,
  }));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <Link
        href="/admin/products"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--foreground)]/60 hover:text-[var(--primary)]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to products
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-black">MagSafe review</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--foreground)]/60">
          Products the vision model flagged as <em>possibly</em> MagSafe with
          low confidence. Confirm to add &ldquo;MagSafe&rdquo; to the title,
          description, tags and the MagSafe collection — or dismiss if it
          isn&apos;t. Confident detections are applied automatically and never
          appear here.
        </p>
      </div>

      <MagSafeReview items={items} />
    </div>
  );
}

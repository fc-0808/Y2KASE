import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { db, isDbConfigured } from "@/lib/db";
import { thumbnailProposals } from "@/lib/db/schema";
import {
  getThumbnailQueueStats,
  getPendingProducts,
} from "@/lib/admin/thumbnails";
import { ThumbnailsReview } from "./ThumbnailsReview";

export const metadata: Metadata = { title: "Admin · Thumbnail review" };
export const dynamic = "force-dynamic";
// Proposal generation runs vision scoring + background removal per product;
// allow generous headroom for a batch on serverless.
export const maxDuration = 300;

export default async function ThumbnailReviewPage() {
  if (!isDbConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Database not configured</h1>
        <p className="mt-2 text-[var(--foreground)]/60">
          Add <code>DATABASE_URL</code> to use the admin panel.
        </p>
      </div>
    );
  }

  const [proposedRows, flaggedRows, approvedRows, stats, pending] =
    await Promise.all([
    db.query.thumbnailProposals.findMany({
      where: eq(thumbnailProposals.status, "proposed"),
      with: {
        product: {
          columns: { id: true, slug: true, title: true },
          with: {
            images: {
              columns: { url: true },
              orderBy: (img, { asc }) => asc(img.position),
              limit: 1,
            },
          },
        },
      },
      orderBy: (t, { desc }) => desc(t.score),
      limit: 100,
    }),
    db.query.thumbnailProposals.findMany({
      where: eq(thumbnailProposals.status, "flagged"),
      with: {
        product: {
          columns: { id: true, slug: true, title: true },
          with: {
            images: {
              columns: { url: true },
              orderBy: (img, { asc }) => asc(img.position),
              limit: 1,
            },
          },
        },
      },
      orderBy: (t, { desc }) => desc(t.updatedAt),
      limit: 60,
    }),
    db.query.thumbnailProposals.findMany({
      where: eq(thumbnailProposals.status, "approved"),
      with: {
        product: {
          columns: { id: true, slug: true, title: true },
          with: {
            images: {
              columns: { url: true },
              orderBy: (img, { asc }) => asc(img.position),
              limit: 1,
            },
          },
        },
      },
      orderBy: (t, { desc }) => desc(t.updatedAt),
      limit: 60,
    }),
    getThumbnailQueueStats(),
    getPendingProducts(48),
  ]);

  const items = proposedRows
    .filter((r) => r.product && r.proposalUrl)
    .map((r) => ({
      productId: r.productId,
      slug: r.product!.slug,
      title: r.product!.title,
      currentUrl: r.product!.images[0]?.url ?? null,
      proposalUrl: r.proposalUrl!,
      score: r.score != null ? Number(r.score) : null,
      category: r.category,
      reason: r.reason,
    }));

  const flagged = flaggedRows
    .filter((r) => r.product)
    .map((r) => ({
      productId: r.productId,
      slug: r.product!.slug,
      title: r.product!.title,
      currentUrl: r.product!.images[0]?.url ?? null,
      score: r.score != null ? Number(r.score) : null,
      category: r.category,
      reason: r.reason,
    }));

  const approved = approvedRows
    .filter((r) => r.product)
    .map((r) => ({
      productId: r.productId,
      slug: r.product!.slug,
      title: r.product!.title,
      currentUrl: r.product!.images[0]?.url ?? null,
    }));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <Link
        href="/admin/products"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--foreground)]/60 hover:text-[var(--primary)]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to products
      </Link>
      <h1 className="text-3xl font-black">Thumbnail review</h1>
      <p className="mt-1 max-w-2xl text-sm text-[var(--foreground)]/60">
        AI selects each product&apos;s cleanest photo, removes its background and
        centers it on a uniform white surface. Approve to make it the live
        thumbnail, flag products that need a better source photo, or skip. The
        real product is never altered — only isolated.
      </p>

      <div className="mt-6">
        <ThumbnailsReview
          items={items}
          flagged={flagged}
          approved={approved}
          pending={pending}
          stats={stats}
        />
      </div>
    </div>
  );
}

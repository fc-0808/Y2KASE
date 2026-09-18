import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { isDbConfigured } from "@/lib/db";
import {
  getThumbnailQueueStats,
  getPendingProducts,
  getProposalQueue,
  getScopeCounts,
  THUMBNAIL_QUEUE_LIST_CAP,
} from "@/lib/admin/thumbnails";
import { parseThumbnailScope } from "@/lib/admin/thumbnail-scope";
import { ThumbnailsReview } from "./ThumbnailsReview";

export const metadata: Metadata = { title: "Admin · Thumbnail review" };
export const dynamic = "force-dynamic";
// Proposal generation runs vision scoring + background removal per product;
// allow generous headroom for a batch on serverless.
export const maxDuration = 300;

export default async function ThumbnailReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string | string[] }>;
}) {
  const scope = parseThumbnailScope((await searchParams).scope);

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

  // Load each status bucket up to the shared cap so section lists stay in
  // lockstep with header stats (the old hard-coded 60 silently hid live rows).
  const [proposedRows, flagged, approved, stats, pending, scopeCounts] =
    await Promise.all([
      getProposalQueue({
        status: "proposed",
        scope,
        limit: THUMBNAIL_QUEUE_LIST_CAP,
        order: "score",
      }),
      getProposalQueue({
        status: "flagged",
        scope,
        limit: THUMBNAIL_QUEUE_LIST_CAP,
        order: "recent",
      }),
      getProposalQueue({
        status: "approved",
        scope,
        limit: THUMBNAIL_QUEUE_LIST_CAP,
        order: "recent",
      }),
      getThumbnailQueueStats(scope),
      getPendingProducts(48, scope),
      getScopeCounts(),
    ]);

  // A "proposed" row without a preview can't be reviewed — treat it as absent
  // rather than rendering a broken card.
  const items = proposedRows
    .filter((r) => r.proposalUrl)
    .map((r) => ({ ...r, proposalUrl: r.proposalUrl! }));

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
        centers it on a uniform white surface. Approve to make it the product&apos;s
        thumbnail — drafts stay unpublished unless you turn on “Publish drafts on
        approve.” Flag products that need a better source photo, or skip. The
        real product is never altered — only isolated.
      </p>

      <div className="mt-6">
        <ThumbnailsReview
          scope={scope}
          scopeCounts={scopeCounts}
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

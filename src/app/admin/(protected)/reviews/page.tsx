import type { Metadata } from "next";
import Link from "next/link";
import { isDbConfigured } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  getAdminReviews,
  getReviewStatusCounts,
  REVIEW_STATUSES,
} from "@/lib/reviews";
import { ReviewsConsole } from "./ReviewsConsole";

export const metadata: Metadata = { title: "Admin · Reviews" };
export const dynamic = "force-dynamic";

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  if (!isDbConfigured()) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-black">Database not configured</h1>
      </div>
    );
  }

  const sp = await searchParams;
  const activeStatus =
    sp.status && (REVIEW_STATUSES as readonly string[]).includes(sp.status)
      ? sp.status
      : undefined;

  const [reviews, counts] = await Promise.all([
    getAdminReviews(activeStatus),
    getReviewStatusCounts(),
  ]);

  const total = counts.pending + counts.published + counts.rejected;
  const tabs = [
    { key: undefined as string | undefined, label: "All", count: total },
    { key: "pending", label: "pending", count: counts.pending },
    { key: "published", label: "published", count: counts.published },
    { key: "rejected", label: "rejected", count: counts.rejected },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-3xl font-black">Reviews</h1>
        <p className="mt-1 text-sm text-[var(--foreground)]/60">
          {counts.pending} awaiting moderation · {counts.published} published.
          Verified-purchase reviews publish automatically.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const isActive = activeStatus === t.key;
          return (
            <Link
              key={t.label}
              href={t.key ? `/admin/reviews?status=${t.key}` : "/admin/reviews"}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-semibold capitalize transition",
                isActive
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--muted)] text-[var(--foreground)]/70 hover:bg-[var(--border)]",
              )}
            >
              {t.label}
              <span className="ml-1.5 opacity-70">{t.count}</span>
            </Link>
          );
        })}
      </div>

      <ReviewsConsole reviews={reviews} />
    </div>
  );
}

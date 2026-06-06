import { BadgeCheck } from "lucide-react";
import { Stars } from "@/components/reviews/Stars";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import type { ReviewSummary } from "@/lib/reviews";
import type { Review } from "@/lib/db/schema";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

/**
 * Full reviews section for a PDP: rating summary with a distribution breakdown,
 * the published review list, and the write-a-review form. Server component —
 * data is passed in from the page so it renders in the initial HTML (crawlable).
 */
export function ProductReviews({
  productId,
  slug,
  summary,
  reviews,
}: {
  productId: number;
  slug: string;
  summary: ReviewSummary;
  reviews: Review[];
}) {
  return (
    <section id="reviews" className="mt-16 max-w-3xl scroll-mt-24">
      <h2 className="mb-5 text-xl font-black">Reviews</h2>

      {summary.count > 0 ? (
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--card)] px-6 py-4 text-center">
            <span className="text-4xl font-black">{summary.average.toFixed(1)}</span>
            <Stars rating={summary.average} size={18} className="mt-1" />
            <span className="mt-1 text-xs font-semibold text-[var(--foreground)]/55">
              {summary.count} review{summary.count === 1 ? "" : "s"}
            </span>
          </div>

          <div className="flex-1 space-y-1.5">
            {([5, 4, 3, 2, 1] as const).map((star) => {
              const n = summary.distribution[star];
              const pct = summary.count > 0 ? (n / summary.count) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-xs">
                  <span className="w-8 shrink-0 font-semibold text-[var(--foreground)]/60">
                    {star}★
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
                    <span
                      className="block h-full rounded-full bg-amber-400"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="w-6 shrink-0 text-right text-[var(--foreground)]/50">
                    {n}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="mb-8 text-[var(--foreground)]/65">
          No reviews yet — be the first to share your thoughts! ✨
        </p>
      )}

      {/* Review list */}
      {reviews.length > 0 && (
        <ul className="mb-10 space-y-5">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="border-b border-[var(--border)] pb-5 last:border-0"
            >
              <div className="flex items-center gap-2">
                <Stars rating={r.rating} size={14} />
                {r.verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    <BadgeCheck className="h-3 w-3" /> Verified Purchase
                  </span>
                )}
              </div>
              {r.title && <p className="mt-2 font-bold">{r.title}</p>}
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-[var(--foreground)]/80">
                {r.body}
              </p>
              <p className="mt-2 text-xs text-[var(--foreground)]/50">
                {r.authorName} · {dateFmt.format(new Date(r.createdAt))}
              </p>
            </li>
          ))}
        </ul>
      )}

      <ReviewForm productId={productId} slug={slug} />
    </section>
  );
}

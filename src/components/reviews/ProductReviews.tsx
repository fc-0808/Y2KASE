import { REVIEW_HISTOGRAM_MIN } from "@/lib/reviews/display";
import type { ReviewSummary } from "@/lib/reviews";
import type { ReviewInviteState } from "@/lib/reviews";
import { Stars } from "@/components/reviews/Stars";
import { ReviewForm, WriteReview } from "@/components/reviews/ReviewForm";
import { ReviewList } from "@/components/reviews/ReviewList";
import type { Review } from "@/lib/db/schema";

/**
 * Product reviews: summary, the written reviews, then a collapsed form.
 * An empty catalog does not advertise itself with "be the first."
 */
export function ProductReviews({
  productId,
  slug,
  summary,
  reviews,
  invite = { status: "none" },
}: {
  productId: number;
  slug: string;
  summary: ReviewSummary;
  reviews: Review[];
  invite?: ReviewInviteState;
}) {
  const showHistogram = summary.count >= REVIEW_HISTOGRAM_MIN;
  const validInvite = invite.status === "valid" ? invite : null;

  return (
    <section id="reviews" className="mt-16 max-w-3xl scroll-mt-24">
      {summary.count > 0 && (
        <>
          <h2 className="mb-4 font-display text-2xl font-extrabold">
            Reviews
            <span className="ml-2 text-base font-bold text-[var(--foreground)]/40">
              {summary.count}
            </span>
          </h2>

          <div
            className={`mb-6 ${showHistogram ? "flex flex-col gap-4 rounded-[1.75rem] border-2 border-white bg-holo p-4 sm:flex-row sm:items-center sm:p-5" : "inline-flex items-center gap-4 rounded-[1.75rem] border-2 border-white bg-holo px-5 py-4"}`}
          >
            <div className={showHistogram ? "text-center sm:min-w-28 sm:px-2" : "flex items-center gap-4"}>
              <span className="font-display text-5xl font-extrabold leading-none">
                {summary.average.toFixed(1)}
              </span>
              <span className={showHistogram ? "mt-1 block" : "block"}>
                <Stars rating={summary.average} size={16} />
                <span className="mt-1 block text-xs font-extrabold text-[var(--foreground)]/60">
                  {summary.count} review{summary.count === 1 ? "" : "s"}
                </span>
              </span>
            </div>

            {showHistogram && (
              <div className="flex-1 space-y-1.5">
                {([5, 4, 3, 2, 1] as const).map((star) => {
                  const n = summary.distribution[star];
                  const pct = summary.count > 0 ? (n / summary.count) * 100 : 0;
                  return (
                    <div key={star} className="flex items-center gap-2 text-xs">
                      <span className="w-8 shrink-0 font-semibold text-[var(--foreground)]/60">
                        {star}★
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/70">
                        <span
                          className="block h-full rounded-full bg-[var(--primary)]"
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
            )}
          </div>

          {reviews.length > 0 && (
            <ReviewList
              reviews={reviews.map((review) => ({
                id: review.id,
                rating: review.rating,
                title: review.title,
                body: review.body,
                authorName: review.authorName,
                verified: review.verified,
                createdAt: review.createdAt,
                merchantReply: review.merchantReply,
              }))}
            />
          )}
        </>
      )}

      {validInvite?.alreadyReviewed ? (
        <p className="text-sm font-semibold text-[var(--foreground)]/70">
          You&apos;ve already reviewed this case. Thank you.
        </p>
      ) : (
        <WriteReview initialOpen={invite.status !== "none"}>
          {invite.status === "expired" && (
            <p className="mb-4 text-sm text-[var(--foreground)]/70">
              That review link has expired. You can still leave a review, and
              we&apos;ll check it before it goes live.
            </p>
          )}
          <ReviewForm
            productId={productId}
            slug={slug}
            plain
            initialName={validInvite?.authorName ?? ""}
            initialRating={validInvite?.initialRating ?? 0}
            reviewToken={validInvite?.token}
          />
        </WriteReview>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { Stars } from "@/components/reviews/Stars";
import { REVIEW_PREVIEW_COUNT } from "@/lib/reviews/display";

export type PublicReview = {
  id: number;
  rating: number;
  title: string | null;
  body: string;
  authorName: string;
  verified: boolean;
  createdAt: Date | string;
  merchantReply: string | null;
};

const dateFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

/** Three reviews, then the rest. The complaint stays; the shop reply sits under it. */
export function ReviewList({ reviews }: { reviews: PublicReview[] }) {
  const [expanded, setExpanded] = useState(false);
  const hidden = reviews.length - REVIEW_PREVIEW_COUNT;
  const visible =
    expanded || hidden <= 0 ? reviews : reviews.slice(0, REVIEW_PREVIEW_COUNT);

  return (
    <div className="mb-8">
      <ul className="space-y-3">
        {visible.map((review) => {
          const initial = review.authorName.slice(0, 1).toUpperCase();
          return (
            <li key={review.id} className="card-cute p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-holo font-display text-base font-extrabold text-[var(--primary)]"
                  >
                    {initial}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="font-extrabold">{review.authorName}</p>
                      {review.verified && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-holo px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--primary)]">
                          <BadgeCheck className="h-3 w-3" /> Verified
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs font-semibold text-[var(--foreground)]/45">
                      {dateFmt.format(new Date(review.createdAt))}
                    </p>
                  </div>
                </div>
                <Stars rating={review.rating} size={13} className="mt-1 shrink-0" />
              </div>
              {review.title && (
                <p className="mt-3 font-extrabold leading-snug">{review.title}</p>
              )}
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[var(--foreground)]/80">
                {review.body}
              </p>
              {review.merchantReply ? (
                <div className="mt-4 rounded-2xl border-2 border-white bg-holo px-3.5 py-3">
                  <p className="font-pixel text-[10px] uppercase text-[var(--primary)]">
                    Y2KASE replied
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">
                    {review.merchantReply}
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-3 text-sm font-extrabold text-[var(--primary)] hover:underline"
        >
          {expanded ? "Show fewer reviews" : `Show all ${reviews.length} reviews`}
        </button>
      )}
    </div>
  );
}

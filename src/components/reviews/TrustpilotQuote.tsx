import { Star } from "lucide-react";
import { TRUSTPILOT_REVIEW } from "@/lib/reviews/trustpilot";

/** Trustpilot's star green. Kept off the amber product stars so the two don't read as one rating. */
const TRUSTPILOT_GREEN = "#00b67a";

function TrustpilotStars({ size }: { size: number }) {
  return (
    <span
      className="inline-flex items-center"
      role="img"
      aria-label={`${TRUSTPILOT_REVIEW.rating} out of 5 stars`}
    >
      {Array.from({ length: TRUSTPILOT_REVIEW.rating }, (_, i) => (
        <Star
          key={i}
          aria-hidden="true"
          style={{
            width: size,
            height: size,
            color: TRUSTPILOT_GREEN,
            fill: TRUSTPILOT_GREEN,
          }}
        />
      ))}
    </span>
  );
}

/**
 * Kylie's verified Trustpilot review.
 *
 * `spotlight` is the homepage break after the first buyer photos. `compact`
 * is the one line in the buy box, next to the decision.
 */
export function TrustpilotQuote({
  variant = "spotlight",
}: {
  variant?: "spotlight" | "compact";
}) {
  const review = TRUSTPILOT_REVIEW;

  if (variant === "compact") {
    return (
      <a
        href={review.href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-2xl bg-[var(--muted)] px-3 py-2.5 text-left transition hover:bg-holo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
      >
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white"
          style={{ backgroundColor: TRUSTPILOT_GREEN }}
          aria-hidden="true"
        >
          <Star className="h-4 w-4" style={{ fill: "currentColor" }} />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-extrabold leading-snug text-[var(--foreground)]">
            “{review.pull}”
          </span>
          <span className="mt-0.5 block text-[11px] font-bold text-[var(--foreground)]/55">
            {review.author}
            <span aria-hidden="true"> · </span>
            <span style={{ color: TRUSTPILOT_GREEN }}>Verified on Trustpilot</span>
          </span>
        </span>
      </a>
    );
  }

  return (
    <a
      href={review.href}
      target="_blank"
      rel="noopener noreferrer"
      className="group mx-auto flex max-w-3xl flex-col items-center gap-4 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 sm:flex-row sm:items-center sm:gap-7 sm:text-left"
    >
      <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 border-white bg-white shadow-[0_4px_0_var(--border),0_12px_24px_rgba(255,62,165,0.18)] transition group-hover:-translate-y-0.5">
        <span
          className="grid h-11 w-11 place-items-center rounded-full text-white"
          style={{ backgroundColor: TRUSTPILOT_GREEN }}
          aria-hidden="true"
        >
          <Star className="h-5 w-5" style={{ fill: "currentColor" }} />
        </span>
      </span>
      <span className="min-w-0">
        <span
          className="font-pixel text-[10px] uppercase sm:text-xs"
          style={{ color: TRUSTPILOT_GREEN }}
        >
          ★ Verified on Trustpilot
        </span>
        <blockquote className="mt-2 font-display text-xl font-extrabold leading-tight text-[var(--foreground)] transition group-hover:text-[var(--primary)] sm:text-2xl">
          “{review.pull}”
        </blockquote>
        <span className="mt-2 inline-flex items-center justify-center gap-2 sm:justify-start">
          <TrustpilotStars size={14} />
          <span className="text-sm font-extrabold text-[var(--foreground)]/70">
            {review.author}
          </span>
        </span>
      </span>
    </a>
  );
}

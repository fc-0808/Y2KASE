import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Stars } from "@/components/reviews/Stars";
import { shortProductLabel, type StorefrontQuote } from "@/lib/reviews/display";

/** One real sentence, styled as a sticker, directly under the hero. */
export function HomeReviewLine({ quote }: { quote: StorefrontQuote }) {
  const productHref = `/products/${quote.productSlug}#reviews`;
  const initial = quote.authorName.slice(0, 1).toUpperCase();

  return (
    <section
      aria-label="Recent customer review"
      className="relative z-10 px-4 pt-5 sm:px-6 sm:pt-8"
    >
      <Link
        href={productHref}
        className="group mx-auto flex max-w-3xl flex-col gap-4 overflow-hidden rounded-[1.75rem] border-2 border-white bg-holo p-5 shadow-[0_22px_50px_-32px_rgba(255,62,165,0.95)] transition duration-300 hover:-translate-y-0.5 sm:flex-row sm:items-center sm:gap-6 sm:p-6"
      >
        <span className="flex items-center gap-3 sm:w-28 sm:flex-col sm:items-start sm:gap-2">
          <span
            aria-hidden
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-white bg-white font-display text-lg font-extrabold text-[var(--primary)]"
          >
            {initial}
          </span>
          <Stars rating={quote.rating} size={14} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="font-pixel text-[10px] uppercase text-[var(--primary)]">
            From a buyer
          </span>
          <blockquote className="mt-1.5 text-balance font-display text-lg font-extrabold leading-snug sm:text-xl">
            “{quote.excerpt}”
          </blockquote>
          <span className="mt-3 flex items-end justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-bold">{quote.authorName}</span>
              {quote.verified ? (
                <span className="mt-1 inline-flex rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--primary)]">
                  Verified
                </span>
              ) : null}
              <span className="mt-1 block text-sm font-extrabold text-[var(--primary)] group-hover:underline">
                {shortProductLabel(quote.productTitle)}
              </span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-[var(--primary)]" />
          </span>
        </span>
      </Link>
    </section>
  );
}

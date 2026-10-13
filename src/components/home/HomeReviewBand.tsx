import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { ProductMedia } from "@/components/ProductMedia";
import { Stars } from "@/components/reviews/Stars";
import { shortProductLabel, type StorefrontQuote } from "@/lib/reviews/display";

/**
 * One short row of buyer quotes. The thumbnail keeps the 4:5 frame so the
 * case stays whole, and it sits beside the words instead of stacking a
 * full-width photo on every card.
 */
export function HomeReviewBand({ quotes }: { quotes: StorefrontQuote[] }) {
  return (
    <ul className="-mx-4 flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
      {quotes.map((quote) => {
        const href = `/products/${quote.productSlug}#reviews`;
        return (
          <li
            key={quote.id}
            className="flex w-[min(92vw,20rem)] shrink-0 snap-start lg:w-[22rem]"
          >
            <Link
              href={href}
              className="card-cute group flex w-full items-center overflow-hidden transition duration-300 hover:border-[var(--primary)]"
            >
              {quote.imageUrl ? (
                <ProductMedia
                  src={quote.imageUrl}
                  alt=""
                  fit="contain"
                  sizes="96px"
                  className="aspect-[4/5] w-[4.75rem] shrink-0 self-center sm:w-[5.5rem]"
                />
              ) : null}
              <span className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5">
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate text-sm font-extrabold">
                      {quote.authorName}
                    </span>
                    {quote.verified ? (
                      <BadgeCheck
                        aria-label="Verified purchase"
                        className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]"
                      />
                    ) : null}
                  </span>
                  <Stars rating={quote.rating} size={11} className="shrink-0" />
                </span>
                <blockquote className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--foreground)]/80">
                  “{quote.excerpt}”
                </blockquote>
                <span className="truncate text-xs font-bold text-[var(--primary)] group-hover:underline">
                  {shortProductLabel(quote.productTitle)}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

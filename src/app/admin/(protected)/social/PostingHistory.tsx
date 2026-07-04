/**
 * Posting history — the "what went out and when" ledger for the Social Studio.
 *
 * One row per listing per day, showing how many photos + videos were posted to
 * Pinterest, when, and a link to the live pins. Server component (display only).
 */

import { History, Images, Film, ExternalLink, ImageOff } from "lucide-react";
import type { PostedListing } from "@/lib/social/auto-pin";

const dayFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export function PostingHistory({ history }: { history: PostedListing[] }) {
  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-black">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--muted)] text-[var(--foreground)]/70">
            <History className="h-5 w-5" />
          </span>
          Posting history
        </h3>
        {history.length > 0 && (
          <span className="text-[11px] font-semibold text-[var(--foreground)]/45">
            Last {history.length} listing{history.length === 1 ? "" : "s"} posted
          </span>
        )}
      </div>

      {history.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-[var(--foreground)]/55">
          Nothing posted yet. Runs will appear here once the auto-pin drip
          publishes its first listing.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {history.map((h) => {
            const key = `${h.productId ?? "x"}-${h.day}`;
            const posted = h.lastPostedAt ? new Date(h.lastPostedAt) : null;
            return (
              <li
                key={key}
                className="flex items-center gap-3 px-5 py-3 transition hover:bg-[var(--muted)]/30"
              >
                {/* Thumbnail */}
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[var(--muted)]">
                  {h.sampleImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={h.sampleImage}
                      alt={h.productTitle ?? "Listing"}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[var(--foreground)]/30">
                      <ImageOff className="h-4 w-4" />
                    </div>
                  )}
                </div>

                {/* Title + media counts */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--foreground)]/85">
                    {h.productSlug ? (
                      <a
                        href={`/products/${h.productSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-[#E60023] hover:underline"
                      >
                        {h.productTitle ?? "Untitled listing"}
                      </a>
                    ) : (
                      (h.productTitle ?? "Untitled listing")
                    )}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--foreground)]/55">
                    {h.imageCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Images className="h-3 w-3" />
                        {h.imageCount} photo{h.imageCount === 1 ? "" : "s"}
                      </span>
                    )}
                    {h.videoCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-[#E60023]">
                        <Film className="h-3 w-3" />
                        {h.videoCount} video{h.videoCount === 1 ? "" : "s"}
                      </span>
                    )}
                    <span className="text-[var(--foreground)]/35">·</span>
                    <span>
                      {dayFmt.format(new Date(`${h.day}T00:00:00`))}
                      {posted ? ` at ${timeFmt.format(posted)}` : ""}
                    </span>
                  </div>
                </div>

                {/* Link to live pins */}
                {h.sampleUrl && (
                  <a
                    href={h.sampleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-[var(--border)] px-3 text-[11px] font-semibold text-[var(--foreground)]/60 transition hover:border-[#E60023] hover:text-[#E60023]"
                  >
                    <ExternalLink className="h-3 w-3" /> View
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

import { Sparkle, PixelHeart } from "@/components/brand/Decor";

const MESSAGES = [
  "Welcome to the Y2KASE Club, bestie!",
  "Buy 2, Get 2 Free — add any 4 to your bag ✨",
  "Free shipping on orders over $35",
  "10% off with code BESTIE10",
  "Tag @y2kase.co for a chance to be featured",
  "New holographic drops every week",
];

/**
 * Holographic marquee announcement bar. The message list is duplicated so the
 * translateX(-50%) loop is seamless. Static content — no client JS.
 */
export function AnnouncementBar() {
  const loop = [...MESSAGES, ...MESSAGES];
  return (
    <div className="bg-holo-shimmer border-b border-[var(--border)]">
      <div className="relative flex overflow-hidden py-1.5">
        <div className="animate-marquee flex shrink-0 items-center whitespace-nowrap">
          {loop.map((m, i) => (
            <span
              key={i}
              className="flex items-center gap-2 px-5 text-xs font-extrabold uppercase tracking-wide text-[var(--foreground)]/80"
            >
              {i % 2 === 0 ? (
                <Sparkle className="h-3 w-3 text-[var(--primary)]" />
              ) : (
                <PixelHeart className="h-3.5 w-3.5" />
              )}
              {m}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

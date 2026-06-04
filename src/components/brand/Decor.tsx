/**
 * Y2KASE brand decor primitives — pure presentational SVG/markup used to
 * sprinkle the holographic kawaii identity across the site. No client JS.
 */
import { cn } from "@/lib/utils";

/** The Y2KASE pixel wordmark (hot-pink fill + white pixel outline). */
export function Wordmark({
  className,
  as: Tag = "span",
}: {
  className?: string;
  as?: "span" | "div" | "h1";
}) {
  return (
    <Tag className={cn("wordmark inline-block leading-none", className)}>
      Y2KASE
    </Tag>
  );
}

/** A classic 4-point Y2K sparkle. Color via `style`/`className` (uses currentColor). */
export function Sparkle({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      style={style}
      className={cn("h-4 w-4", className)}
      fill="currentColor"
    >
      <path d="M12 0c.6 5.7 2.3 9.4 12 12-9.7 2.6-11.4 6.3-12 12-.6-5.7-2.3-9.4-12-12C9.7 9.4 11.4 5.7 12 0Z" />
    </svg>
  );
}

/** A holographic heart. Optional pixel notch on the dip for a Y2K feel. */
export function PixelHeart({ className }: { className?: string }) {
  const id = "holoHeart";
  return (
    <svg
      viewBox="0 0 32 30"
      aria-hidden
      className={cn("h-5 w-5", className)}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffc2ea" />
          <stop offset="45%" stopColor="#c9b4ff" />
          <stop offset="100%" stopColor="#9fe0ff" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${id})`}
        stroke="#fff"
        strokeWidth="1.5"
        d="M16 28C6 21 1 16 1 9.5 1 5 4.5 2 8.5 2 11.5 2 14 3.6 16 6.2 18 3.6 20.5 2 23.5 2 27.5 2 31 5 31 9.5 31 16 26 21 16 28Z"
      />
    </svg>
  );
}

/** Sticker-style pill badge (matches the "GOOD VIBES / STAY CUTE" art). */
export function Sticker({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn("sticker text-xs", className)}>{children}</span>;
}

/** A scattered field of twinkling sparkles for hero/section backdrops. */
export function SparkleField({ className }: { className?: string }) {
  const dots = [
    { top: "12%", left: "8%", size: "h-5 w-5", color: "text-white", delay: "0s" },
    { top: "24%", left: "92%", size: "h-4 w-4", color: "text-[var(--accent)]", delay: "0.6s" },
    { top: "68%", left: "5%", size: "h-3 w-3", color: "text-[var(--accent-blue)]", delay: "1.1s" },
    { top: "80%", left: "88%", size: "h-5 w-5", color: "text-white", delay: "0.3s" },
    { top: "44%", left: "50%", size: "h-3 w-3", color: "text-[var(--primary)]", delay: "1.4s" },
    { top: "8%", left: "60%", size: "h-3 w-3", color: "text-[var(--accent-butter)]", delay: "0.9s" },
  ];
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden
    >
      {dots.map((d, i) => (
        <Sparkle
          key={i}
          className={cn("absolute animate-twinkle", d.size, d.color)}
          style={{ top: d.top, left: d.left, animationDelay: d.delay }}
        />
      ))}
    </div>
  );
}

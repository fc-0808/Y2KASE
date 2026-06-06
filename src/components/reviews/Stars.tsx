import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Read-only star rating display. Renders five stars with the appropriate fill
 * for fractional averages (e.g. 4.3 → four full + one ~30% star) using a
 * clipped overlay, so the visual matches the numeric average exactly.
 */
export function Stars({
  rating,
  size = 16,
  className,
}: {
  rating: number;
  size?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(5, rating));
  return (
    <span
      className={cn("inline-flex items-center", className)}
      aria-label={`${clamped.toFixed(1)} out of 5 stars`}
      role="img"
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, clamped - i)); // 0..1 for this star
        return (
          <span
            key={i}
            className="relative inline-block"
            style={{ width: size, height: size }}
          >
            <Star
              className="absolute inset-0 text-[var(--foreground)]/25"
              style={{ width: size, height: size }}
            />
            <span
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${fill * 100}%` }}
            >
              <Star
                className="text-amber-400"
                style={{ width: size, height: size, fill: "currentColor" }}
              />
            </span>
          </span>
        );
      })}
    </span>
  );
}

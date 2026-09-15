import { cn } from "@/lib/utils";
import type { MotifFamily } from "@/lib/catalog/motifs";

/**
 * Visual motif chip — emoji on a pastel disc, shared by the catalog filter,
 * applied-filter chips and the admin picker so a Cloud looks like a cloud
 * everywhere.
 */
export function MotifMark({
  family,
  size = "md",
  className,
}: {
  family: MotifFamily;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full bg-[var(--muted)]",
        size === "sm" && "h-3.5 w-3.5 text-[9px]",
        size === "md" && "h-5 w-5 text-[11px]",
        size === "lg" && "h-6 w-6 text-sm",
        className,
      )}
    >
      {family.icon}
    </span>
  );
}

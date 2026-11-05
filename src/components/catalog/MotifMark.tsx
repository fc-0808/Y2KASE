import Image from "next/image";
import { cn } from "@/lib/utils";
import { motifIconSrc, type MotifFamily } from "@/lib/catalog/motifs";

/**
 * Theme sticker — the same pixel mark on the look rail, the applied-filter
 * chip, and the admin picker, so a Cloud is a cloud everywhere.
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
        "relative inline-grid shrink-0 overflow-hidden bg-[#efe4ff]",
        size === "sm" && "h-4 w-4 rounded-md",
        size === "md" && "h-8 w-8 rounded-lg",
        size === "lg" && "block aspect-square w-full rounded-xl",
        className,
      )}
    >
      <Image
        src={motifIconSrc(family.slug)}
        alt=""
        fill
        sizes={size === "lg" ? "(min-width: 1024px) 108px, 80px" : "32px"}
        quality={75}
        fetchPriority={size === "lg" ? "low" : "auto"}
        className="object-cover"
      />
    </span>
  );
}

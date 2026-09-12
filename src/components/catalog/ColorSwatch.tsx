import { cn } from "@/lib/utils";
import {
  colorSwatchBackground,
  type ColorFamily,
} from "@/lib/catalog/colors";

/**
 * Visual color chip used by the catalog filter, applied-filter overview and
 * the admin picker. Painting it from {@link ColorFamily.swatch} in one place
 * is what keeps "Clear" looking like glass on every surface.
 */
export function ColorSwatch({
  family,
  size = "md",
  className,
}: {
  family: ColorFamily;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block shrink-0 rounded-full",
        size === "sm" && "h-3.5 w-3.5",
        size === "md" && "h-5 w-5",
        size === "lg" && "h-6 w-6",
        family.light && "ring-1 ring-inset ring-black/20",
        className,
      )}
      style={{ background: colorSwatchBackground(family) }}
    />
  );
}

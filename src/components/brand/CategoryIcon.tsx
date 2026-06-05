/**
 * CategoryIcon — renders a Y2KASE kawaii category icon for a collection.
 *
 * The SVG markup is produced by `categoryIconSvg` (a trusted, code-generated
 * string — no user input), so `dangerouslySetInnerHTML` is safe here. Works in
 * both server and client components. Size is controlled via `className`.
 */
import { categoryIconSvg } from "@/lib/brand/category-icons";

export function CategoryIcon({
  slug,
  color,
  kind,
  className,
}: {
  slug: string;
  color?: string | null;
  kind?: string;
  className?: string;
}) {
  const svg = categoryIconSvg(slug, color ?? "#ff3ea5", { kind });
  return (
    <span
      aria-hidden
      className={className}
      style={{ display: "inline-flex", lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * CatalogSummary — "1–24 of 111 products", the removable filter chips, and the
 * escape hatch back to an unfiltered view.
 *
 * The chips are the only affordance that makes a faceted grid recoverable: a
 * shopper who has narrowed three ways needs to see all three and undo any one
 * of them without hunting back through the menus that set them.
 */

import Link from "next/link";
import { X } from "lucide-react";
import { deviceLabel } from "@/lib/catalog/devices";
import type { ColorFamily } from "@/lib/catalog/colors";
import {
  colorFamily,
  colorFamilyLabel,
  isColorFamilySlug,
} from "@/lib/catalog/colors";
import {
  isMotifFamilySlug,
  motifFamily,
  motifFamilyLabel,
} from "@/lib/catalog/motifs";
import { buildCatalogHref, type CatalogParams } from "@/lib/catalog/params";
import type { BrandOption } from "./brand-options";
import { brandOptionName } from "./brand-options";
import { ColorSwatch } from "./ColorSwatch";

export type CatalogChip = {
  key: string;
  label: string;
  clearHref: string;
  /** Visual marker for color chips — omitted for every other facet. */
  swatch?: ColorFamily;
};

/** Prettify a slug we have no display name for ("my-melody" → "my melody"). */
export function humanize(slug: string): string {
  return slug.replace(/[-_]/g, " ");
}

/**
 * One chip per narrowing the shopper has applied, each linking to the same
 * catalog with just that one facet dropped.
 *
 * Derived from `params` alone, so a surface gets chips for exactly the facets
 * it actually left in its state. A collection landing page blanks `collection`
 * (its route already says so) and therefore never renders a chip that would
 * clear to the page it is already on.
 */
export function buildCatalogChips(
  params: CatalogParams,
  {
    brands,
    collectionName,
  }: { brands: BrandOption[]; collectionName?: string },
): CatalogChip[] {
  const chips: CatalogChip[] = [];
  const nameOf = (slug: string) =>
    brandOptionName(brands, slug) ?? humanize(slug);

  if (params.device)
    chips.push({
      key: "device",
      label: deviceLabel(params.device),
      clearHref: buildCatalogHref(params, { device: undefined }),
    });
  if (params.collection)
    chips.push({
      key: "collection",
      label: collectionName ?? humanize(params.collection),
      clearHref: buildCatalogHref(params, { collection: undefined }),
    });
  for (const slug of params.brands)
    chips.push({
      key: `brand:${slug}`,
      label: nameOf(slug),
      clearHref: buildCatalogHref(params, {
        brands: params.brands.filter((s) => s !== slug),
      }),
    });
  for (const slug of params.colors) {
    const family = isColorFamilySlug(slug) ? colorFamily(slug) : null;
    chips.push({
      key: `color:${slug}`,
      label: family ? family.label : colorFamilyLabel(slug),
      clearHref: buildCatalogHref(params, {
        colors: params.colors.filter((s) => s !== slug),
      }),
      swatch: family ?? undefined,
    });
  }
  for (const slug of params.motifs) {
    const family = isMotifFamilySlug(slug) ? motifFamily(slug) : null;
    chips.push({
      key: `motif:${slug}`,
      label: family ? family.label : motifFamilyLabel(slug),
      clearHref: buildCatalogHref(params, {
        motifs: params.motifs.filter((s) => s !== slug),
      }),
    });
  }
  if (params.magsafe !== undefined)
    chips.push({
      key: "magsafe",
      label: params.magsafe ? "MagSafe" : "Non-MagSafe",
      clearHref: buildCatalogHref(params, { magsafe: undefined }),
    });
  if (params.tag)
    chips.push({
      key: "tag",
      label: humanize(params.tag),
      clearHref: buildCatalogHref(params, { tag: undefined }),
    });
  if (params.q)
    chips.push({
      key: "q",
      label: `“${params.q}”`,
      clearHref: buildCatalogHref(params, { q: undefined }),
    });

  return chips;
}

export function CatalogSummary({
  total,
  rangeStart,
  rangeEnd,
  chips,
  resetHref,
}: {
  total: number;
  rangeStart: number;
  rangeEnd: number;
  chips: CatalogChip[];
  /** Where "Clear all" goes — this surface, unfiltered. Omit to hide it. */
  resetHref?: string;
}) {
  return (
    <div className="mb-5 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 sm:mb-6 sm:mt-4">
      <p
        aria-live="polite"
        className="text-sm font-semibold text-[var(--foreground)]/55"
      >
        {total > 0 ? (
          <>
            <span className="font-extrabold text-[var(--foreground)]">
              {rangeStart}–{rangeEnd}
            </span>{" "}
            of{" "}
            <span className="font-extrabold text-[var(--foreground)]">
              {total}
            </span>{" "}
            product{total === 1 ? "" : "s"}
          </>
        ) : (
          "No products"
        )}
      </p>

      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.clearHref}
          aria-label={`Remove filter: ${chip.label}`}
          className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3 py-1 text-sm font-semibold capitalize text-white shadow-[0_2px_0_#d62f88] transition hover:brightness-105"
        >
          {chip.swatch && (
            <ColorSwatch
              family={chip.swatch}
              size="sm"
              className="ring-white/40"
            />
          )}
          {chip.label}
          <X aria-hidden className="h-3.5 w-3.5 text-white/80" />
        </Link>
      ))}

      {resetHref && (
        <Link
          href={resetHref}
          className="text-sm font-semibold text-[var(--foreground)]/50 underline-offset-4 transition hover:text-[var(--primary)] hover:underline"
        >
          Clear all
        </Link>
      )}
    </div>
  );
}

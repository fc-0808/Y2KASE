"use client";

/**
 * Catalog filter state — one hook, two presentations.
 *
 * Desktop paints dropdown pills; mobile paints a bottom sheet. Both must speak
 * the same URL, the same optimistic checkboxes, and the same dead-end counts,
 * so the logic lives here instead of being copied into each chrome.
 *
 * The URL remains the source of truth. This hook only reads `params` and
 * pushes new URLs. Brand, theme and color toggles are wrapped in
 * `useOptimistic` so a checkbox flips on the same frame it is clicked while
 * the server re-renders the grid behind it.
 */

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MAGSAFE_FACETS } from "@/lib/catalog/magsafe";
import {
  allDevices,
  catalogHasMultipleDevices,
  deviceLabel,
  deviceOffersMagSafe,
  type DeviceNode,
} from "@/lib/catalog/devices";
import {
  COLOR_FAMILIES,
  type ColorFamily,
  type ColorFamilySlug,
} from "@/lib/catalog/colors";
import {
  MOTIF_FAMILIES,
  type MotifFamily,
  type MotifFamilySlug,
} from "@/lib/catalog/motifs";
import { buildCatalogHref, type CatalogParams } from "@/lib/catalog/params";
import { type BrandOption, brandOptionName } from "./brand-options";
import { treeSlugs } from "./facet-ui";

/** Products each option would return, given the shopper's other filters. */
export type FacetCounts = {
  magsafe: { on: number; off: number };
  brands: Record<string, number>;
  colors: Record<string, number>;
  motifs: Record<string, number>;
  devices: Record<string, number>;
};

export type CatalogFilterModel = {
  params: CatalogParams;
  brands: BrandOption[];
  counts: FacetCounts;
  brandsLabel: string;
  isPending: boolean;
  selectedBrands: string[];
  selectedColors: string[];
  selectedMotifs: string[];
  deviceFacetVisible: boolean;
  deviceTriggerLabel: string;
  deviceOptions: DeviceNode[];
  deviceTotal: number;
  deviceCounts: Record<string, number>;
  compatibilityVisible: boolean;
  compatibilityLabel: string;
  colorFacetVisible: boolean;
  colorTriggerLabel: string;
  selectedColorFamilies: ColorFamily[];
  motifFacetVisible: boolean;
  motifTriggerLabel: string;
  selectedMotifFamilies: MotifFamily[];
  selectedTreeCount: number;
  activeBrandsLabel: string;
  navigate: (overrides: Partial<CatalogParams>) => void;
  selectDevice: (device: string | undefined) => void;
  selectCompatibility: (magsafe: boolean | undefined) => void;
  toggleBrand: (slug: string) => void;
  toggleParent: (brand: BrandOption) => void;
  toggleChild: (brand: BrandOption, childSlug: string) => void;
  toggleColor: (slug: ColorFamilySlug) => void;
  toggleMotif: (slug: MotifFamilySlug) => void;
  isBrandExpanded: (brand: BrandOption) => boolean;
  toggleBrandExpanded: (slug: string) => void;
  resetBrandTrees: () => void;
};

export function useCatalogFilters({
  params,
  brands,
  counts,
  brandsLabel = "Brands",
  lockedDevice,
}: {
  params: CatalogParams;
  brands: BrandOption[];
  counts: FacetCounts;
  brandsLabel?: string;
  lockedDevice?: string;
}): CatalogFilterModel {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedBrands, setSelectedBrands] = useOptimistic(params.brands);
  const [selectedColors, setSelectedColors] = useOptimistic(params.colors);
  const [selectedMotifs, setSelectedMotifs] = useOptimistic(params.motifs);
  // Character trees are closed by default. These two sets capture only the
  // shopper's explicit toggles — selection-driven auto-open is derived below,
  // so we never need an effect to sync them.
  const [userExpanded, setUserExpanded] = useState<string[]>([]);
  const [userCollapsed, setUserCollapsed] = useState<string[]>([]);

  function resetBrandTrees() {
    setUserExpanded([]);
    setUserCollapsed([]);
  }

  function isBrandExpanded(brand: BrandOption): boolean {
    if (!brand.children?.length) return false;
    if (userCollapsed.includes(brand.slug)) return false;
    if (userExpanded.includes(brand.slug)) return true;
    // Auto-open when a character under this brand is selected, so a chip for
    // "Kuromi" doesn't strand the shopper looking at a collapsed Sanrio.
    return brand.children.some((child) => selectedBrands.includes(child.slug));
  }

  function toggleBrandExpanded(slug: string) {
    const brand = brands.find((b) => b.slug === slug);
    const openNow = brand ? isBrandExpanded(brand) : false;
    if (openNow) {
      setUserExpanded((prev) => prev.filter((s) => s !== slug));
      setUserCollapsed((prev) =>
        prev.includes(slug) ? prev : [...prev, slug],
      );
    } else {
      setUserCollapsed((prev) => prev.filter((s) => s !== slug));
      setUserExpanded((prev) =>
        prev.includes(slug) ? prev : [...prev, slug],
      );
    }
  }

  function navigate(overrides: Partial<CatalogParams>) {
    startTransition(() => {
      if (overrides.brands !== undefined) setSelectedBrands(overrides.brands);
      if (overrides.colors !== undefined) setSelectedColors(overrides.colors);
      if (overrides.motifs !== undefined) setSelectedMotifs(overrides.motifs);
      // `scroll: false` — the filter bar sits at the top of the page, so the
      // shopper is already where the new results will appear; jumping would
      // only yank an open menu out from under the cursor (and, on mobile,
      // yank the sheet the shopper is still ticking).
      router.push(buildCatalogHref(params, overrides), { scroll: false });
    });
  }

  function selectCompatibility(magsafe: boolean | undefined) {
    if (magsafe === params.magsafe) return;
    navigate({ magsafe });
  }

  function selectDevice(device: string | undefined) {
    if (device === params.device) return;
    const next: Partial<CatalogParams> = { device };
    // MagSafe cannot apply to AirPods (or Watch, Kindle, …). Clearing it
    // here means the chip disappears on the same navigation that switches
    // lines, instead of lingering as a filter that can only return nothing.
    if (device && !deviceOffersMagSafe(device)) {
      next.magsafe = undefined;
    }
    navigate(next);
  }

  /** Flat toggle for surfaces that offer a single-level vocabulary. */
  function toggleBrand(slug: string) {
    navigate({
      brands: selectedBrands.includes(slug)
        ? selectedBrands.filter((s) => s !== slug)
        : [...selectedBrands, slug],
    });
  }

  /**
   * Parent brand checkbox. Selecting the parent means "whole brand"; if any of
   * its characters were selected, they are replaced by the parent slug so the
   * OR semantics don't quietly widen the result set again.
   */
  function toggleParent(brand: BrandOption) {
    const tree = new Set(treeSlugs(brand));
    const without = selectedBrands.filter((s) => !tree.has(s));
    if (selectedBrands.includes(brand.slug)) {
      navigate({ brands: without });
      return;
    }
    navigate({ brands: [...without, brand.slug] });
  }

  /**
   * Character checkbox. Always written without the parent slug — `brand=sanrio
   * &brand=hello-kitty` would OR back to all of Sanrio. Narrowing from the
   * whole brand to one character is therefore a replace, not an add.
   */
  function toggleChild(brand: BrandOption, childSlug: string) {
    const tree = new Set(treeSlugs(brand));
    const without = selectedBrands.filter((s) => !tree.has(s));
    const childSlugs = brand.children?.map((c) => c.slug) ?? [];

    // Whole brand → one character: drop the parent, keep only this child.
    if (selectedBrands.includes(brand.slug)) {
      navigate({ brands: [...without, childSlug] });
      return;
    }

    const next = new Set(childSlugs.filter((s) => selectedBrands.includes(s)));
    if (next.has(childSlug)) next.delete(childSlug);
    else next.add(childSlug);

    // Every stocked child ticked → collapse back to the parent.
    if (next.size === childSlugs.length && childSlugs.length > 0) {
      navigate({ brands: [...without, brand.slug] });
      return;
    }
    navigate({ brands: [...without, ...next] });
  }

  function toggleColor(slug: ColorFamilySlug) {
    navigate({
      colors: selectedColors.includes(slug)
        ? selectedColors.filter((s) => s !== slug)
        : [...selectedColors, slug],
    });
  }

  function toggleMotif(slug: MotifFamilySlug) {
    navigate({
      motifs: selectedMotifs.includes(slug)
        ? selectedMotifs.filter((s) => s !== slug)
        : [...selectedMotifs, slug],
    });
  }

  const deviceCounts = counts.devices ?? {};
  const deviceOptions = allDevices().filter((device) => {
    const count = deviceCounts[device.id] ?? 0;
    return count > 0 || device.id === params.device;
  });
  const deviceTotal = deviceOptions.reduce(
    (sum, device) => sum + (deviceCounts[device.id] ?? 0),
    0,
  );
  // Hidden on device landings (`lockedDevice`) and on iPhone-only catalogs.
  // A selected `?device=` still shows, so a bookmark remains recoverable.
  const deviceFacetVisible =
    !lockedDevice &&
    (Boolean(params.device) || catalogHasMultipleDevices(deviceCounts));
  const deviceTriggerLabel = params.device
    ? deviceLabel(params.device)
    : "Device";

  const scopedDevice = lockedDevice ?? params.device;
  const compatibilityVisible =
    params.magsafe !== undefined ||
    !scopedDevice ||
    deviceOffersMagSafe(scopedDevice);

  const compatibilityLabel =
    MAGSAFE_FACETS.find((facet) => facet.magsafe === params.magsafe)?.label ??
    "Compatibility";

  const activeBrandsLabel =
    selectedBrands.length === 1
      ? (brandOptionName(brands, selectedBrands[0]) ?? brandsLabel)
      : brandsLabel;

  // Badge counts distinct brand *trees* touched, not every character slug —
  // "Sanrio + Hello Kitty + Kuromi" is one brand narrowed, not three.
  const selectedTreeCount = brands.filter((brand) =>
    treeSlugs(brand).some((s) => selectedBrands.includes(s)),
  ).length;

  const selectedColorFamilies = COLOR_FAMILIES.filter((family) =>
    selectedColors.includes(family.slug),
  );
  const colorTriggerLabel =
    selectedColorFamilies.length === 1
      ? selectedColorFamilies[0]!.label
      : "Color";
  // Hide the facet entirely until at least one product in this view has a
  // colour — an empty Color menu on an unclassified catalogue is worse than
  // no menu. A selected value still shows, so a stale bookmark remains
  // recoverable.
  const colorFacetVisible =
    selectedColors.length > 0 ||
    COLOR_FAMILIES.some((family) => (counts.colors[family.slug] ?? 0) > 0);

  const selectedMotifFamilies = MOTIF_FAMILIES.filter((family) =>
    selectedMotifs.includes(family.slug),
  );
  const motifTriggerLabel =
    selectedMotifFamilies.length === 1
      ? selectedMotifFamilies[0]!.label
      : "Theme";
  const motifFacetVisible =
    selectedMotifs.length > 0 ||
    MOTIF_FAMILIES.some((family) => (counts.motifs[family.slug] ?? 0) > 0);

  return {
    params,
    brands,
    counts,
    brandsLabel,
    isPending,
    selectedBrands,
    selectedColors,
    selectedMotifs,
    deviceFacetVisible,
    deviceTriggerLabel,
    deviceOptions,
    deviceTotal,
    deviceCounts,
    compatibilityVisible,
    compatibilityLabel,
    colorFacetVisible,
    colorTriggerLabel,
    selectedColorFamilies,
    motifFacetVisible,
    motifTriggerLabel,
    selectedMotifFamilies,
    selectedTreeCount,
    activeBrandsLabel,
    navigate,
    selectDevice,
    selectCompatibility,
    toggleBrand,
    toggleParent,
    toggleChild,
    toggleColor,
    toggleMotif,
    isBrandExpanded,
    toggleBrandExpanded,
    resetBrandTrees,
  };
}

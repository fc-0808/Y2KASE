"use client";

/**
 * CatalogFilterSheet — mobile faceted refine.
 *
 * Industry pattern (Shopify Dawn, Nike, Sephora, Baymard 2025/26):
 *  - one Filter control, not five wrapping dropdowns
 *  - accordion sections, auto-open where something is already selected
 *  - visual grids for color and theme (Baymard: visual filters for visual
 *    attributes)
 *  - live apply via the URL (shareable, back-safe) with a sticky footer that
 *    announces the resulting count and closes the sheet
 *
 * Multi-select facets stay in the sheet after each tick so picking three
 * colours is three taps, not three round trips through an overlay.
 */

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { MAGSAFE_FACETS } from "@/lib/catalog/magsafe";
import { deviceFilterLabel } from "@/lib/catalog/devices";
import { COLOR_FAMILIES } from "@/lib/catalog/colors";
import { MOTIF_FAMILIES } from "@/lib/catalog/motifs";
import { cn } from "@/lib/utils";
import { CatalogBottomSheet } from "./CatalogBottomSheet";
import { BrandTree, OptionRow } from "./facet-ui";
import { ColorSwatch } from "./ColorSwatch";
import { MotifMark } from "./MotifMark";
import type { CatalogFilterModel } from "./use-catalog-filters";

type SectionId = "device" | "compatibility" | "brands" | "motifs" | "colors";

export function CatalogFilterSheet({
  open,
  onClose,
  model,
  resultCount,
  resetHref,
}: {
  open: boolean;
  onClose: () => void;
  model: CatalogFilterModel;
  resultCount: number;
  resetHref?: string;
}) {
  const {
    params,
    brands,
    counts,
    brandsLabel,
    isPending,
    selectedBrands,
    selectedColors,
    selectedMotifs,
    deviceFacetVisible,
    deviceOptions,
    deviceTotal,
    deviceCounts,
    compatibilityVisible,
    colorFacetVisible,
    motifFacetVisible,
    selectedTreeCount,
  } = model;

  const [expanded, setExpanded] = useState<Set<SectionId>>(new Set());

  // Seed the accordion from the URL that *opened* the sheet. Re-running on
  // every tick would collapse a section the shopper just expanded the moment
  // a checkbox flipped.
  useEffect(() => {
    if (!open) return;
    const next = new Set<SectionId>();
    if (params.device) next.add("device");
    if (params.magsafe !== undefined) next.add("compatibility");
    if (selectedBrands.length > 0) next.add("brands");
    if (selectedMotifs.length > 0) next.add("motifs");
    if (selectedColors.length > 0) next.add("colors");
    if (next.size === 0) {
      if (deviceFacetVisible) next.add("device");
      else if (brands.length > 0) next.add("brands");
      else if (compatibilityVisible) next.add("compatibility");
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpanded(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open-only seed
  }, [open]);

  function toggleSection(id: SectionId) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const showClear = Boolean(resetHref);

  return (
    <CatalogBottomSheet
      open={open}
      onClose={onClose}
      title="Filters"
      height="full"
      footer={
        <div className="flex items-center gap-2">
          {showClear && resetHref ? (
            <ClearAllButton href={resetHref} />
          ) : (
            <span className="flex-1" />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-busy={isPending}
            className="btn-candy min-h-12 flex-1 px-4 text-sm"
          >
            {resultCount === 0
              ? "No products"
              : `Show ${resultCount.toLocaleString("en-US")} product${resultCount === 1 ? "" : "s"}`}
          </button>
        </div>
      }
    >
      {deviceFacetVisible && (
        <FilterSection
          id="filter-device"
          title="Device"
          badge={params.device ? 1 : 0}
          open={expanded.has("device")}
          onToggle={() => toggleSection("device")}
        >
          <fieldset>
            <legend className="sr-only">Device</legend>
            <OptionRow
              type="radio"
              name="filter-sheet-device"
              label="All devices"
              count={deviceTotal}
              checked={params.device === undefined}
              onSelect={() => model.selectDevice(undefined)}
            />
            {deviceOptions.map((device) => {
              const count = deviceCounts[device.id] ?? 0;
              const checked = params.device === device.id;
              return (
                <OptionRow
                  key={device.id}
                  type="radio"
                  name="filter-sheet-device"
                  label={deviceFilterLabel(device.id)}
                  count={count}
                  checked={checked}
                  disabled={count === 0 && !checked}
                  onSelect={() => model.selectDevice(device.id)}
                  swatch={
                    <span aria-hidden className="text-sm leading-none">
                      {device.icon}
                    </span>
                  }
                />
              );
            })}
          </fieldset>
        </FilterSection>
      )}

      {compatibilityVisible && (
        <FilterSection
          id="filter-compatibility"
          title="Compatibility"
          badge={params.magsafe !== undefined ? 1 : 0}
          open={expanded.has("compatibility")}
          onToggle={() => toggleSection("compatibility")}
        >
          <fieldset>
            <legend className="sr-only">Device compatibility</legend>
            <OptionRow
              type="radio"
              name="filter-sheet-compatibility"
              label="All cases"
              count={counts.magsafe.on + counts.magsafe.off}
              checked={params.magsafe === undefined}
              onSelect={() => model.selectCompatibility(undefined)}
            />
            {MAGSAFE_FACETS.map((facet) => (
              <OptionRow
                key={facet.id}
                type="radio"
                name="filter-sheet-compatibility"
                label={facet.label}
                count={facet.magsafe ? counts.magsafe.on : counts.magsafe.off}
                checked={params.magsafe === facet.magsafe}
                onSelect={() => model.selectCompatibility(facet.magsafe)}
              />
            ))}
          </fieldset>
        </FilterSection>
      )}

      {brands.length > 0 && (
        <FilterSection
          id="filter-brands"
          title={brandsLabel}
          badge={selectedTreeCount}
          open={expanded.has("brands")}
          onToggle={() => toggleSection("brands")}
        >
          <BrandTree
            brands={brands}
            counts={counts.brands}
            selectedBrands={selectedBrands}
            brandsLabel={brandsLabel}
            isBrandExpanded={model.isBrandExpanded}
            toggleBrandExpanded={model.toggleBrandExpanded}
            toggleParent={model.toggleParent}
            toggleChild={model.toggleChild}
            toggleBrand={model.toggleBrand}
            onClear={() => model.navigate({ brands: [] })}
          />
        </FilterSection>
      )}

      {motifFacetVisible && (
        <FilterSection
          id="filter-motifs"
          title="Theme"
          badge={selectedMotifs.length}
          open={expanded.has("motifs")}
          onToggle={() => toggleSection("motifs")}
        >
          <div className="grid grid-cols-3 gap-2 px-1 sm:grid-cols-4">
            {MOTIF_FAMILIES.map((family) => {
              const count = counts.motifs[family.slug] ?? 0;
              const checked = selectedMotifs.includes(family.slug);
              if (count === 0 && !checked) return null;
              return (
                <VisualChoice
                  key={family.slug}
                  label={family.label}
                  count={count}
                  checked={checked}
                  disabled={count === 0 && !checked}
                  onSelect={() => model.toggleMotif(family.slug)}
                  swatch={<MotifMark family={family} size="lg" />}
                />
              );
            })}
          </div>
          {selectedMotifs.length > 0 && (
            <button
              type="button"
              onClick={() => model.navigate({ motifs: [] })}
              className="mt-2 min-h-11 w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[var(--primary)] transition hover:bg-[var(--muted)]"
            >
              Clear themes
            </button>
          )}
        </FilterSection>
      )}

      {colorFacetVisible && (
        <FilterSection
          id="filter-colors"
          title="Color"
          badge={selectedColors.length}
          open={expanded.has("colors")}
          onToggle={() => toggleSection("colors")}
        >
          <div className="grid grid-cols-4 gap-2 px-1">
            {COLOR_FAMILIES.map((family) => {
              const count = counts.colors[family.slug] ?? 0;
              const checked = selectedColors.includes(family.slug);
              if (count === 0 && !checked) return null;
              return (
                <VisualChoice
                  key={family.slug}
                  label={family.label}
                  count={count}
                  checked={checked}
                  disabled={count === 0 && !checked}
                  onSelect={() => model.toggleColor(family.slug)}
                  swatch={<ColorSwatch family={family} size="lg" />}
                />
              );
            })}
          </div>
          {selectedColors.length > 0 && (
            <button
              type="button"
              onClick={() => model.navigate({ colors: [] })}
              className="mt-2 min-h-11 w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[var(--primary)] transition hover:bg-[var(--muted)]"
            >
              Clear colors
            </button>
          )}
        </FilterSection>
      )}
    </CatalogBottomSheet>
  );
}

function ClearAllButton({ href }: { href: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(href, { scroll: false })}
      className="min-h-12 shrink-0 rounded-full px-3 text-sm font-bold text-[var(--foreground)]/60 underline-offset-4 transition hover:text-[var(--primary)] hover:underline"
    >
      Clear all
    </button>
  );
}

function FilterSection({
  id,
  title,
  badge,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  badge: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const panelId = useId();
  return (
    <section className="border-b border-[var(--border)]">
      <h3>
        <button
          type="button"
          id={id}
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-14 w-full items-center gap-2 px-3 text-left transition hover:bg-[var(--muted)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]"
        >
          <span className="flex-1 text-[15px] font-extrabold">{title}</span>
          {badge > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--primary)] px-1.5 text-[11px] font-extrabold tabular-nums text-white">
              {badge}
            </span>
          )}
          <ChevronDown
            aria-hidden
            className={cn(
              "h-4 w-4 shrink-0 text-[var(--foreground)]/40 transition",
              open && "rotate-180 text-[var(--primary)]",
            )}
          />
        </button>
      </h3>
      {open && (
        <div id={panelId} className="px-1 pb-3" role="region" aria-labelledby={id}>
          {children}
        </div>
      )}
    </section>
  );
}

function VisualChoice({
  label,
  count,
  checked,
  disabled,
  onSelect,
  swatch,
}: {
  label: string;
  count: number;
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
  swatch: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={checked}
      className={cn(
        "relative flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl border px-1.5 py-2 text-center transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        checked
          ? "border-[var(--primary)] bg-[var(--primary-soft)]"
          : "border-[var(--border)] bg-[var(--background)]/40",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      {checked && (
        <span
          aria-hidden
          className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-[var(--primary)] text-white"
        >
          <Check className="h-2.5 w-2.5" strokeWidth={4} />
        </span>
      )}
      {swatch}
      <span className="w-full truncate text-[11px] font-bold leading-tight">
        {label}
      </span>
      <span className="text-[10px] font-bold tabular-nums text-[var(--foreground)]/40">
        {count}
      </span>
    </button>
  );
}

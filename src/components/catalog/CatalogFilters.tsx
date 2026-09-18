"use client";

/**
 * CatalogFilters — desktop faceted browse controls (lg+).
 *
 * The shopper's questions, in the order the bar asks them:
 *  1. *what is it for* (device — iPhone vs AirPods)
 *  2. *will it work with my charger* (MagSafe)
 *  3. *whose face is on it* (brand / character)
 *  4. *what's on it* (theme / motif)
 *  5. *what colour is it* (color)
 *
 * Mobile no longer paints this pill row — five wrapping dropdowns steal the
 * fold and fight thumbs. Phones open {@link CatalogFilterSheet} from the
 * compact refine bar instead. This file is the `lg+` dropdown chrome on top
 * of {@link useCatalogFilters}, so the URL contract never forks.
 *
 * ── Why it looks the way it does ────────────────────────────────────────────
 *  - Device and compatibility are single-select and commit-and-close. Brands,
 *    themes and colors are multi-select and stay open.
 *  - Color is a *visual* facet (Baymard). Each option is a swatch plus a label
 *    plus a count, never a color-only control.
 *  - The controls are real <input type="radio"|"checkbox"> elements inside
 *    <label>s for native semantics.
 */

import { useEffect, useId, useRef, useState } from "react";
import { MAGSAFE_FACETS } from "@/lib/catalog/magsafe";
import { deviceFilterLabel } from "@/lib/catalog/devices";
import { COLOR_FAMILIES } from "@/lib/catalog/colors";
import { MOTIF_FAMILIES } from "@/lib/catalog/motifs";
import type { CatalogFilterModel } from "./use-catalog-filters";
import { BrandTree, FacetPanel, FacetTrigger, OptionRow } from "./facet-ui";
import { ColorSwatch } from "./ColorSwatch";
import { MotifMark } from "./MotifMark";

export type { BrandOption } from "./brand-options";
export type { FacetCounts } from "./use-catalog-filters";

type OpenFacet =
  | "device"
  | "compatibility"
  | "brands"
  | "motifs"
  | "colors"
  | null;

export function CatalogFilters({ model }: { model: CatalogFilterModel }) {
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
    deviceTriggerLabel,
    deviceOptions,
    deviceTotal,
    deviceCounts,
    compatibilityVisible,
    compatibilityLabel,
    colorFacetVisible,
    colorTriggerLabel,
    motifFacetVisible,
    motifTriggerLabel,
    selectedTreeCount,
    activeBrandsLabel,
    selectDevice,
    selectCompatibility,
    toggleColor,
    toggleMotif,
    navigate,
    resetBrandTrees,
  } = model;

  const [open, setOpen] = useState<OpenFacet>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const facetId = useId();

  // Dismiss on outside click / Escape — the same contract as the nav
  // mega-panel, so the two menus behave like one system.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function openBrandsPanel() {
    resetBrandTrees();
    setOpen("brands");
  }

  return (
    <div
      ref={rootRef}
      className="relative hidden flex-wrap items-center gap-2 lg:flex"
      role="group"
      aria-label="Filter products"
    >
      {deviceFacetVisible && (
        <div className="relative">
          <FacetTrigger
            panelId={`${facetId}-device`}
            label={deviceTriggerLabel}
            active={Boolean(params.device)}
            expanded={open === "device"}
            onToggle={() => setOpen(open === "device" ? null : "device")}
          />
          {open === "device" && (
            <FacetPanel id={`${facetId}-device`} busy={isPending}>
              <fieldset>
                <legend className="sr-only">Device</legend>
                <OptionRow
                  type="radio"
                  name={`${facetId}-device-group`}
                  label="All devices"
                  count={deviceTotal}
                  checked={params.device === undefined}
                  onSelect={() => {
                    setOpen(null);
                    selectDevice(undefined);
                  }}
                />
                {deviceOptions.map((device) => {
                  const count = deviceCounts[device.id] ?? 0;
                  const checked = params.device === device.id;
                  return (
                    <OptionRow
                      key={device.id}
                      type="radio"
                      name={`${facetId}-device-group`}
                      label={deviceFilterLabel(device.id)}
                      count={count}
                      checked={checked}
                      disabled={count === 0 && !checked}
                      onSelect={() => {
                        setOpen(null);
                        selectDevice(device.id);
                      }}
                      swatch={
                        <span aria-hidden className="text-sm leading-none">
                          {device.icon}
                        </span>
                      }
                    />
                  );
                })}
              </fieldset>
            </FacetPanel>
          )}
        </div>
      )}

      {compatibilityVisible && (
        <div className="relative">
          <FacetTrigger
            panelId={`${facetId}-compatibility`}
            label={compatibilityLabel}
            active={params.magsafe !== undefined}
            expanded={open === "compatibility"}
            onToggle={() =>
              setOpen(open === "compatibility" ? null : "compatibility")
            }
          />
          {open === "compatibility" && (
            <FacetPanel id={`${facetId}-compatibility`} busy={isPending}>
              <fieldset>
                <legend className="sr-only">Device compatibility</legend>
                <OptionRow
                  type="radio"
                  name={`${facetId}-compatibility-group`}
                  label="All cases"
                  count={counts.magsafe.on + counts.magsafe.off}
                  checked={params.magsafe === undefined}
                  onSelect={() => {
                    setOpen(null);
                    selectCompatibility(undefined);
                  }}
                />
                {MAGSAFE_FACETS.map((facet) => (
                  <OptionRow
                    key={facet.id}
                    type="radio"
                    name={`${facetId}-compatibility-group`}
                    label={facet.label}
                    count={facet.magsafe ? counts.magsafe.on : counts.magsafe.off}
                    checked={params.magsafe === facet.magsafe}
                    onSelect={() => {
                      setOpen(null);
                      selectCompatibility(facet.magsafe);
                    }}
                  />
                ))}
              </fieldset>
            </FacetPanel>
          )}
        </div>
      )}

      {brands.length > 0 && (
        <div className="relative">
          <FacetTrigger
            panelId={`${facetId}-brands`}
            label={activeBrandsLabel}
            badge={selectedTreeCount > 1 ? selectedTreeCount : 0}
            active={selectedBrands.length > 0}
            expanded={open === "brands"}
            onToggle={() =>
              open === "brands" ? setOpen(null) : openBrandsPanel()
            }
          />
          {open === "brands" && (
            <FacetPanel id={`${facetId}-brands`} busy={isPending}>
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
                onClear={() => navigate({ brands: [] })}
              />
            </FacetPanel>
          )}
        </div>
      )}

      {motifFacetVisible && (
        <div className="relative">
          <FacetTrigger
            panelId={`${facetId}-motifs`}
            label={motifTriggerLabel}
            badge={selectedMotifs.length > 1 ? selectedMotifs.length : 0}
            active={selectedMotifs.length > 0}
            expanded={open === "motifs"}
            onToggle={() => setOpen(open === "motifs" ? null : "motifs")}
          />
          {open === "motifs" && (
            <FacetPanel
              id={`${facetId}-motifs`}
              busy={isPending}
              className="sm:w-80"
            >
              <fieldset>
                <legend className="sr-only">Theme</legend>
                {MOTIF_FAMILIES.map((family) => {
                  const count = counts.motifs[family.slug] ?? 0;
                  const checked = selectedMotifs.includes(family.slug);
                  if (count === 0 && !checked) return null;
                  return (
                    <OptionRow
                      key={family.slug}
                      type="checkbox"
                      label={family.label}
                      count={count}
                      checked={checked}
                      disabled={count === 0 && !checked}
                      onSelect={() => toggleMotif(family.slug)}
                      compact
                      swatch={<MotifMark family={family} size="md" />}
                    />
                  );
                })}
              </fieldset>
              {selectedMotifs.length > 0 && (
                <button
                  type="button"
                  onClick={() => navigate({ motifs: [] })}
                  className="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[var(--primary)] transition hover:bg-[var(--muted)]"
                >
                  Clear themes
                </button>
              )}
            </FacetPanel>
          )}
        </div>
      )}

      {colorFacetVisible && (
        <div className="relative">
          <FacetTrigger
            panelId={`${facetId}-colors`}
            label={colorTriggerLabel}
            badge={selectedColors.length > 1 ? selectedColors.length : 0}
            active={selectedColors.length > 0}
            expanded={open === "colors"}
            onToggle={() => setOpen(open === "colors" ? null : "colors")}
          />
          {open === "colors" && (
            <FacetPanel
              id={`${facetId}-colors`}
              busy={isPending}
              className="sm:w-80"
            >
              <fieldset>
                <legend className="sr-only">Color</legend>
                {COLOR_FAMILIES.map((family) => {
                  const count = counts.colors[family.slug] ?? 0;
                  const checked = selectedColors.includes(family.slug);
                  if (count === 0 && !checked) return null;
                  return (
                    <OptionRow
                      key={family.slug}
                      type="checkbox"
                      label={family.label}
                      count={count}
                      checked={checked}
                      disabled={count === 0 && !checked}
                      onSelect={() => toggleColor(family.slug)}
                      compact
                      swatch={<ColorSwatch family={family} size="md" />}
                    />
                  );
                })}
              </fieldset>
              {selectedColors.length > 0 && (
                <button
                  type="button"
                  onClick={() => navigate({ colors: [] })}
                  className="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[var(--primary)] transition hover:bg-[var(--muted)]"
                >
                  Clear colors
                </button>
              )}
            </FacetPanel>
          )}
        </div>
      )}
    </div>
  );
}

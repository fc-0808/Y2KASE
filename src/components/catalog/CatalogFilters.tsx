"use client";

/**
 * CatalogFilters — the storefront's faceted browse controls.
 *
 * Four facets, because those are the four questions a shopper actually
 * arrives with: *will it work with my charger* (compatibility), *whose face is
 * on it* (brand / character), *what's on it* (theme / motif) and *what colour
 * is it* (color). Everything else the catalog can express — device, tag, free
 * text — already has a better entry point (the nav, the PDP, the search box),
 * and duplicating them here is what turned this bar into a wall of pills.
 *
 * The second facet is a vocabulary, not a fixed list: `/products` fills it with
 * top-level brands (and nests their stocked characters underneath), while a
 * collection landing page fills it with that collection's own children and
 * relabels it accordingly. Both travel through the same `?brand=` parameter.
 *
 * Character selection replaces the parent in the URL rather than OR-ing with
 * it: `?brand=sanrio&brand=hello-kitty` would still return all of Sanrio,
 * because brands are OR-ed. Narrowing to Hello Kitty is `?brand=hello-kitty`.
 *
 * Color is a closed family list (`?color=pink&color=blue`) with OR-within
 * semantics, so a shopper who will take pink *or* blue does not have to run
 * two searches. Families, not raw names: "navy" and "sky" both tick Blue.
 *
 * Theme is the same shape for what is *depicted* (`?motif=puppy&motif=clouds`):
 * the browse path for products that have no licensed character, and a useful
 * narrowing inside a brand ("Hello Kitty, but bows").
 *
 * ── Why it looks the way it does ────────────────────────────────────────────
 *  - Compatibility is single-select (a case is MagSafe or it isn't) and so is
 *    rendered as radios that commit and close. Brands, themes and colors are
 *    multi-select and stay open, so picking three values is three clicks
 *    rather than three round trips through the menu.
 *  - Color is a *visual* facet (Baymard: use visual filters for visually
 *    distinct attributes). Each option is a swatch plus a label plus a count,
 *    never a color-only control — labels keep it usable for color-blind
 *    shoppers and for screen readers.
 *  - The controls are real <input type="radio"|"checkbox"> elements inside
 *    <label>s. Native semantics give us arrow-key navigation within the radio
 *    group, Space to toggle, correct screen-reader announcements and form
 *    semantics for free — all of which a div-with-role reimplementation has to
 *    earn back by hand, usually incompletely.
 *  - Every option carries the number of products it would return under the
 *    shopper's *other* active filters, so a dead end is visible before it's
 *    clicked (see `getCatalogFacetCounts`).
 *
 * ── State ───────────────────────────────────────────────────────────────────
 * The URL is the state; this component only reads `params` and pushes new URLs.
 * Brand, theme and color toggles are wrapped in `useOptimistic` so a checkbox flips
 * on the same frame it is clicked while the server re-renders the grid behind
 * it, and the optimistic value falls back to the URL automatically if that
 * navigation is superseded.
 */

import {
  useEffect,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { MAGSAFE_FACETS } from "@/lib/catalog/magsafe";
import {
  COLOR_FAMILIES,
  type ColorFamilySlug,
} from "@/lib/catalog/colors";
import {
  MOTIF_FAMILIES,
  type MotifFamilySlug,
} from "@/lib/catalog/motifs";
import { cn } from "@/lib/utils";
import { buildCatalogHref, type CatalogParams } from "@/lib/catalog/params";
import { type BrandOption, brandOptionName } from "./brand-options";
import { ColorSwatch } from "./ColorSwatch";

export type { BrandOption } from "./brand-options";

/** Products each option would return, given the shopper's other filters. */
export type FacetCounts = {
  magsafe: { on: number; off: number };
  brands: Record<string, number>;
  colors: Record<string, number>;
  motifs: Record<string, number>;
};

type OpenFacet = "compatibility" | "brands" | "motifs" | "colors" | null;

/** Every slug that belongs to this brand's checkbox group (parent + children). */
function treeSlugs(brand: BrandOption): string[] {
  return [brand.slug, ...(brand.children?.map((c) => c.slug) ?? [])];
}

export function CatalogFilters({
  params,
  brands,
  counts,
  brandsLabel = "Brands",
}: {
  params: CatalogParams;
  brands: BrandOption[];
  counts: FacetCounts;
  /** What this surface calls its subtree facet — "Brands", "Characters", … */
  brandsLabel?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedBrands, setSelectedBrands] = useOptimistic(params.brands);
  const [selectedColors, setSelectedColors] = useOptimistic(params.colors);
  const [selectedMotifs, setSelectedMotifs] = useOptimistic(params.motifs);
  const [open, setOpen] = useState<OpenFacet>(null);
  // Character trees are closed by default. These two sets capture only the
  // shopper's explicit toggles — selection-driven auto-open is derived below,
  // so we never need an effect to sync them.
  const [userExpanded, setUserExpanded] = useState<string[]>([]);
  const [userCollapsed, setUserCollapsed] = useState<string[]>([]);
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
    // Fresh open: drop prior expand/collapse so the menu always starts closed
    // except where a character chip already forces a tree open.
    setUserExpanded([]);
    setUserCollapsed([]);
    setOpen("brands");
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
      // only yank the open menu out from under the cursor.
      router.push(buildCatalogHref(params, overrides), { scroll: false });
    });
  }

  function selectCompatibility(magsafe: boolean | undefined) {
    setOpen(null);
    if (magsafe === params.magsafe) return;
    navigate({ magsafe });
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

    const next = new Set(
      childSlugs.filter((s) => selectedBrands.includes(s)),
    );
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

  return (
    <div
      ref={rootRef}
      className="relative flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Filter products"
    >
      <div className="sm:relative">
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
                onSelect={() => selectCompatibility(undefined)}
              />
              {MAGSAFE_FACETS.map((facet) => (
                <OptionRow
                  key={facet.id}
                  type="radio"
                  name={`${facetId}-compatibility-group`}
                  label={facet.label}
                  count={facet.magsafe ? counts.magsafe.on : counts.magsafe.off}
                  checked={params.magsafe === facet.magsafe}
                  onSelect={() => selectCompatibility(facet.magsafe)}
                />
              ))}
            </fieldset>
          </FacetPanel>
        )}
      </div>

      {brands.length > 0 && (
        <div className="sm:relative">
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
              <fieldset>
                <legend className="sr-only">{brandsLabel}</legend>
                {brands.map((brand) => {
                  const children = brand.children ?? [];
                  const hasChildren = children.length > 0;
                  const parentChecked = selectedBrands.includes(brand.slug);
                  const selectedChildren = children.filter((c) =>
                    selectedBrands.includes(c.slug),
                  );
                  const brandActive =
                    parentChecked || selectedChildren.length > 0;
                  const count = counts.brands[brand.slug] ?? 0;
                  const childrenOpen = isBrandExpanded(brand);

                  // Nested brands use the parent/child toggles; a flat
                  // vocabulary (collection landing pages) keeps the simple
                  // toggle so we don't invent a tree that isn't there.
                  const onParentSelect = hasChildren
                    ? () => toggleParent(brand)
                    : () => toggleBrand(brand.slug);

                  return (
                    <div key={brand.slug}>
                      <OptionRow
                        type="checkbox"
                        label={brand.name}
                        count={count}
                        checked={parentChecked}
                        // Indeterminate when characters are selected under an
                        // unchecked parent — the visual cue that the brand is
                        // active but narrowed.
                        indeterminate={
                          !parentChecked && selectedChildren.length > 0
                        }
                        disabled={count === 0 && !brandActive}
                        onSelect={onParentSelect}
                        swatch={
                          <span
                            aria-hidden
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{
                              background: brand.accentColor ?? "var(--primary)",
                            }}
                          />
                        }
                        expand={
                          hasChildren
                            ? {
                                open: childrenOpen,
                                count: children.length,
                                label: brand.name,
                                onToggle: () =>
                                  toggleBrandExpanded(brand.slug),
                              }
                            : undefined
                        }
                      />
                      {childrenOpen && (
                        <div
                          role="group"
                          aria-label={`${brand.name} characters`}
                          className="mb-1 ml-4 border-l border-[var(--border)] pl-2"
                        >
                          {children.map((child) => {
                            const childChecked =
                              parentChecked ||
                              selectedBrands.includes(child.slug);
                            const childCount =
                              counts.brands[child.slug] ?? 0;
                            return (
                              <OptionRow
                                key={child.slug}
                                type="checkbox"
                                label={child.name}
                                count={childCount}
                                checked={childChecked}
                                disabled={
                                  childCount === 0 &&
                                  !selectedBrands.includes(child.slug)
                                }
                                onSelect={() =>
                                  toggleChild(brand, child.slug)
                                }
                                compact
                                swatch={
                                  <span
                                    aria-hidden
                                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                                    style={{
                                      background:
                                        child.accentColor ??
                                        brand.accentColor ??
                                        "var(--primary)",
                                    }}
                                  />
                                }
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </fieldset>
              {selectedBrands.length > 0 && (
                <button
                  type="button"
                  onClick={() => navigate({ brands: [] })}
                  className="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[var(--primary)] transition hover:bg-[var(--muted)]"
                >
                  Clear {brandsLabel.toLowerCase()}
                </button>
              )}
            </FacetPanel>
          )}
        </div>
      )}

      {motifFacetVisible && (
        <div className="sm:relative">
          <FacetTrigger
            panelId={`${facetId}-motifs`}
            label={motifTriggerLabel}
            badge={selectedMotifs.length > 1 ? selectedMotifs.length : 0}
            active={selectedMotifs.length > 0}
            expanded={open === "motifs"}
            onToggle={() =>
              setOpen(open === "motifs" ? null : "motifs")
            }
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
        <div className="sm:relative">
          <FacetTrigger
            panelId={`${facetId}-colors`}
            label={colorTriggerLabel}
            badge={selectedColors.length > 1 ? selectedColors.length : 0}
            active={selectedColors.length > 0}
            expanded={open === "colors"}
            onToggle={() =>
              setOpen(open === "colors" ? null : "colors")
            }
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

function FacetTrigger({
  panelId,
  label,
  active,
  badge = 0,
  expanded,
  onToggle,
}: {
  panelId: string;
  label: string;
  active: boolean;
  badge?: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={panelId}
      className={cn(
        "flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-bold shadow-sm transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
        active || expanded
          ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
          : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]/80 hover:border-[var(--primary)] hover:text-[var(--primary)]",
      )}
    >
      <span className="max-w-[9rem] truncate">{label}</span>
      {badge > 0 && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--primary)] px-1 text-[11px] font-extrabold tabular-nums text-white">
          {badge}
        </span>
      )}
      <ChevronDown
        aria-hidden
        className={cn("h-4 w-4 shrink-0 transition", expanded && "rotate-180")}
      />
    </button>
  );
}

/**
 * The dropdown surface.
 *
 * Positioning is CSS-only across breakpoints: the wrapper is `relative` on
 * mobile and each facet becomes `sm:relative`, so the panel spans the whole
 * filter row on a phone (where a 288px menu anchored to a trigger halfway
 * across the screen would hang off the edge) and tucks neatly under its own
 * trigger from `sm` up. No measurement, no resize listener, nothing to get out
 * of sync with the layout.
 */
function FacetPanel({
  id,
  busy,
  className,
  children,
}: {
  id: string;
  busy: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      aria-busy={busy}
      className={cn(
        "absolute left-0 right-0 top-full z-40 mt-2 animate-float-up rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2",
        "shadow-[0_24px_60px_-24px_rgba(120,60,120,0.55)] sm:right-auto sm:w-72",
        "max-h-[min(60vh,24rem)] overflow-y-auto overscroll-contain",
        busy && "opacity-60",
        className,
      )}
    >
      {children}
    </div>
  );
}

function OptionRow({
  type,
  name,
  label,
  count,
  checked,
  indeterminate = false,
  disabled = false,
  compact = false,
  onSelect,
  swatch,
  expand,
}: {
  type: "radio" | "checkbox";
  name?: string;
  label: string;
  count: number;
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onSelect: () => void;
  swatch?: React.ReactNode;
  /** Nested character expander — only on brand parents that have children. */
  expand?: {
    open: boolean;
    count: number;
    label: string;
    onToggle: () => void;
  };
}) {
  // Top-level brand rows reserve a fixed chevron column even when a brand has
  // no children, so product counts (41 / 16 / 10…) stay on one vertical edge
  // instead of shifting left wherever a chevron appears.
  const reserveExpand = !compact;

  return (
    <div
      className={cn(
        "flex items-center rounded-xl transition",
        !disabled && "hover:bg-[var(--muted)]",
      )}
    >
      <label
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 px-3 transition",
          compact ? "py-1.5" : "py-2",
          disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
        )}
      >
        <input
          type={type}
          name={name}
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          // Indeterminate is a DOM property, not an attribute — set via ref
          // callback so React doesn't try to reconcile it as a prop.
          ref={(el) => {
            if (el) el.indeterminate = indeterminate;
          }}
          onChange={onSelect}
        />
        <span
          aria-hidden
          className={cn(
            "grid shrink-0 place-items-center border-2 border-[var(--border)] bg-white text-transparent transition",
            compact ? "h-4 w-4" : "h-5 w-5",
            type === "radio" ? "rounded-full" : "rounded-md",
            "peer-checked:border-[var(--primary)] peer-checked:bg-[var(--primary)] peer-checked:text-white",
            indeterminate &&
              "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ring)] peer-focus-visible:ring-offset-2",
          )}
        >
          {indeterminate && !checked ? (
            <span className="h-0.5 w-2 rounded-full bg-[var(--primary)]" />
          ) : (
            <Check
              className={compact ? "h-2.5 w-2.5" : "h-3 w-3"}
              strokeWidth={4}
            />
          )}
        </span>
        {swatch}
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-semibold text-[var(--foreground)]/75 transition peer-checked:text-[var(--foreground)]",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            // Fixed width + right align + tabular nums: every count shares the
            // same right edge, including 1-digit vs 2-digit values.
            "w-7 shrink-0 text-right font-bold tabular-nums text-[var(--foreground)]/35",
            compact ? "text-[10px]" : "text-xs",
          )}
        >
          {count}
        </span>
      </label>

      {reserveExpand && (
        <div className="mr-1 grid w-7 shrink-0 place-items-center">
          {expand ? (
            <button
              type="button"
              aria-expanded={expand.open}
              aria-label={
                expand.open
                  ? `Hide ${expand.label} characters`
                  : `Show ${expand.count} character${expand.count === 1 ? "" : "s"} in ${expand.label}`
              }
              onClick={(event) => {
                event.preventDefault();
                expand.onToggle();
              }}
              className={cn(
                "grid h-7 w-7 place-items-center rounded-lg transition",
                "text-[var(--foreground)]/45 hover:bg-[var(--muted)] hover:text-[var(--primary)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                expand.open && "text-[var(--primary)]",
              )}
            >
              <ChevronDown
                aria-hidden
                className={cn(
                  "h-3.5 w-3.5 transition",
                  expand.open && "rotate-180",
                )}
              />
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

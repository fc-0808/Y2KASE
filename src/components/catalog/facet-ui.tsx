"use client";

/**
 * Shared facet controls — the checkbox/radio row, the desktop pill trigger,
 * the desktop dropdown panel, and the brand tree. Desktop dropdowns and the
 * mobile filter sheet both paint from here so a MagSafe count, an indeterminate
 * Sanrio parent, and a colour swatch cannot drift between surfaces.
 */

import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BrandOption } from "./brand-options";

export function FacetTrigger({
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
 *
 * On the current storefront the wrapping pill row is `lg+` only — phones use
 * the filter sheet — but the same positioning still matters for a 1024px
 * laptop, where five pills can sit close to the trailing edge.
 */
export function FacetPanel({
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

export function OptionRow({
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
          "flex min-h-11 min-w-0 flex-1 items-center gap-3 px-3 transition",
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
                "grid h-11 w-7 place-items-center rounded-lg transition",
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

/** Every slug that belongs to this brand's checkbox group (parent + children). */
export function treeSlugs(brand: BrandOption): string[] {
  return [brand.slug, ...(brand.children?.map((c) => c.slug) ?? [])];
}

export function BrandTree({
  brands,
  counts,
  selectedBrands,
  brandsLabel,
  isBrandExpanded,
  toggleBrandExpanded,
  toggleParent,
  toggleChild,
  toggleBrand,
  onClear,
}: {
  brands: BrandOption[];
  counts: Record<string, number>;
  selectedBrands: string[];
  brandsLabel: string;
  isBrandExpanded: (brand: BrandOption) => boolean;
  toggleBrandExpanded: (slug: string) => void;
  toggleParent: (brand: BrandOption) => void;
  toggleChild: (brand: BrandOption, childSlug: string) => void;
  toggleBrand: (slug: string) => void;
  onClear?: () => void;
}) {
  return (
    <>
      <fieldset>
        <legend className="sr-only">{brandsLabel}</legend>
        {brands.map((brand) => {
          const children = brand.children ?? [];
          const hasChildren = children.length > 0;
          const parentChecked = selectedBrands.includes(brand.slug);
          const selectedChildren = children.filter((c) =>
            selectedBrands.includes(c.slug),
          );
          const brandActive = parentChecked || selectedChildren.length > 0;
          const count = counts[brand.slug] ?? 0;
          const childrenOpen = isBrandExpanded(brand);

          // Nested brands use the parent/child toggles; a flat vocabulary
          // (collection landing pages) keeps the simple toggle so we don't
          // invent a tree that isn't there.
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
                indeterminate={!parentChecked && selectedChildren.length > 0}
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
                        onToggle: () => toggleBrandExpanded(brand.slug),
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
                      parentChecked || selectedBrands.includes(child.slug);
                    const childCount = counts[child.slug] ?? 0;
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
                        onSelect={() => toggleChild(brand, child.slug)}
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
      {selectedBrands.length > 0 && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="mt-1 min-h-11 w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[var(--primary)] transition hover:bg-[var(--muted)]"
        >
          Clear {brandsLabel.toLowerCase()}
        </button>
      )}
    </>
  );
}

"use client";

/**
 * ProductsCollectionNav — the brand / character browse axis for the Product
 * Admin, a sibling of the device bar.
 *
 * Collections are the *marketing* taxonomy (Sanrio, Miffy, Hello Kitty, …),
 * modelled as a tree in the DB. Brands and non-brand collections are rendered
 * as separate facets so genres such as "Kawaii" are not mislabeled as brands.
 * Zero-result options are omitted until selected, and every row wraps instead
 * of scrolling. This keeps the control useful at any viewport width without
 * clipping labels or exposing a decorative horizontal scrollbar.
 */
import Link from "next/link";
import type { AdminCollectionOption } from "@/lib/collections";

export type CollectionSelection = number | "all";

export function CollectionNavBar({
  options,
  counts,
  total,
  active,
  onSelect,
  manageHref = "/admin/collections",
}: {
  options: AdminCollectionOption[];
  /** View-scoped product counts by collection id (falls back to option.count). */
  counts?: Map<number, number>;
  /** Products in the current non-collection filter scope. */
  total: number;
  active: CollectionSelection;
  onSelect: (selection: CollectionSelection) => void;
  manageHref?: string;
}) {
  const topLevel = options.filter((o) => o.parentId == null);
  const byId = new Map(options.map((o) => [o.id, o]));
  const countOf = (c: AdminCollectionOption) => counts?.get(c.id) ?? c.count;

  const activeNode = active === "all" ? undefined : byId.get(active);
  // Walk to the root instead of assuming a one-level tree. The current
  // taxonomy is shallow, but this remains correct if a nested collection is
  // introduced later.
  const activeTopId = activeNode ? rootCollectionId(activeNode, byId) : null;
  const activeTop = activeTopId != null ? byId.get(activeTopId) : undefined;
  const isVisible = (option: AdminCollectionOption) =>
    countOf(option) > 0 || activeTopId === option.id || active === option.id;

  const brands = topLevel.filter(
    (option) => option.kind === "brand" && isVisible(option),
  );
  const tags = topLevel.filter(
    (option) => option.kind !== "brand" && isVisible(option),
  );
  const children = activeTop
    ? options.filter(
        (option) => option.parentId === activeTop.id && isVisible(option),
      )
    : [];

  return (
    <div className="space-y-3.5 px-4 py-3.5 sm:px-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/45">
          Collections
        </p>
        <Link
          href={manageHref}
          className="inline-flex min-h-8 shrink-0 items-center rounded-md px-2 text-xs font-semibold text-foreground/55 transition hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Manage collections
        </Link>
      </div>

      <FilterRow label="Brands" ariaLabel="Filter products by brand">
        <FilterButton
          label="All"
          count={total}
          active={active === "all"}
          onClick={() => onSelect("all")}
        />
        {brands.map((option) => (
          <FilterButton
            key={option.id}
            label={option.name}
            count={countOf(option)}
            active={active === option.id}
            context={activeTopId === option.id && active !== option.id}
            onClick={() => onSelect(option.id)}
          />
        ))}
      </FilterRow>

      {tags.length > 0 && (
        <FilterRow label="Tags" ariaLabel="Filter products by collection tag">
          {tags.map((option) => (
            <FilterButton
              key={option.id}
              label={option.name}
              count={countOf(option)}
              active={active === option.id}
              onClick={() => onSelect(option.id)}
            />
          ))}
        </FilterRow>
      )}

      {/* Drill-down: characters within the active brand. */}
      {activeTop?.kind === "brand" && children.length > 0 && (
        <div className="border-t border-border pt-3.5">
          <FilterRow
            label={activeTop.name}
            ariaLabel={`Filter within ${activeTop.name}`}
          >
            <FilterButton
              label={`All ${activeTop.name}`}
              count={countOf(activeTop)}
              active={active === activeTop.id}
              compact
              onClick={() => onSelect(activeTop.id)}
            />
            {children.map((option) => (
              <FilterButton
                key={option.id}
                label={option.name}
                count={countOf(option)}
                active={active === option.id}
                compact
                onClick={() => onSelect(option.id)}
              />
            ))}
          </FilterRow>
        </div>
      )}
    </div>
  );
}

function FilterRow({
  label,
  ariaLabel,
  children,
}: {
  label: string;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:items-start">
      <span className="pt-2 text-xs font-semibold text-foreground/55">
        {label}
      </span>
      <div
        role="group"
        aria-label={ariaLabel}
        className="flex min-w-0 flex-wrap gap-2"
      >
        {children}
      </div>
    </div>
  );
}

function FilterButton({
  label,
  count,
  active,
  context = false,
  compact = false,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  context?: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 rounded-lg border font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        compact ? "min-h-8 px-2.5 text-xs" : "min-h-9 px-3 text-sm"
      } ${
        active
          ? "border-primary bg-primary-soft text-foreground shadow-sm"
          : context
            ? "border-primary/40 bg-primary/[0.07] text-primary"
            : "border-border bg-background/60 text-foreground/75 hover:border-primary/50 hover:bg-muted"
      }`}
    >
      <span className="whitespace-nowrap">{label}</span>
      {count != null && (
        <span
          className={`text-xs tabular-nums ${
            active ? "text-foreground/60" : "text-foreground/40"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function rootCollectionId(
  node: AdminCollectionOption,
  byId: Map<number, AdminCollectionOption>,
): number {
  let current = node;
  const seen = new Set<number>();

  while (current.parentId != null && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = byId.get(current.parentId);
    if (!parent) break;
    current = parent;
  }

  return current.id;
}

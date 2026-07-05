"use client";

/**
 * ProductsCollectionNav — the brand / character browse axis for the Product
 * Admin, a sibling of the device bar.
 *
 * Collections are the *marketing* taxonomy (Sanrio, Miffy, Hello Kitty, …),
 * modelled as a tree in the DB. This renders the top-level brands/themes as a
 * horizontal pill bar, and — once a brand with children is active — reveals a
 * second row of its characters so a large catalog can be drilled down quickly
 * (e.g. iPhone → Sanrio → Hello Kitty). Selection composes with every other
 * filter, and respects the hierarchy (picking "Sanrio" includes its children).
 */
import Link from "next/link";
import { Tag, FolderTree } from "lucide-react";
import type { AdminCollectionOption } from "@/lib/collections";

export type CollectionSelection = number | "all";

export function CollectionNavBar({
  options,
  counts,
  active,
  onSelect,
  manageHref = "/admin/collections",
}: {
  options: AdminCollectionOption[];
  /** View-scoped product counts by collection id (falls back to option.count). */
  counts?: Map<number, number>;
  active: CollectionSelection;
  onSelect: (selection: CollectionSelection) => void;
  manageHref?: string;
}) {
  const topLevel = options.filter((o) => o.parentId == null);
  const byId = new Map(options.map((o) => [o.id, o]));
  const countOf = (c: AdminCollectionOption) => counts?.get(c.id) ?? c.count;

  // Which top-level node is in context: the active one, or the active child's
  // parent — so drilling into a character keeps its brand highlighted.
  const activeNode = active === "all" ? undefined : byId.get(active);
  const activeTopId =
    activeNode == null
      ? null
      : activeNode.parentId == null
        ? activeNode.id
        : activeNode.parentId;

  const children = activeTopId
    ? options.filter((o) => o.parentId === activeTopId)
    : [];
  const activeTop = activeTopId != null ? byId.get(activeTopId) : undefined;

  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center gap-2">
        <nav
          aria-label="Filter products by brand"
          className="flex flex-1 items-center gap-1.5 overflow-x-auto pb-1"
        >
          <span className="shrink-0 pr-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/35">
            Brand
          </span>
          <Pill
            label="All"
            icon={<Tag className="h-3.5 w-3.5" />}
            active={active === "all"}
            onClick={() => onSelect("all")}
          />
          {topLevel.map((c) => {
            const n = countOf(c);
            return (
              <Pill
                key={c.id}
                label={c.name}
                emoji={c.icon}
                count={n}
                muted={n === 0}
                active={activeTopId === c.id}
                onClick={() => onSelect(c.id)}
              />
            );
          })}
        </nav>
        <Link
          href={manageHref}
          className="flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--primary)] hover:underline"
        >
          <FolderTree className="h-3.5 w-3.5" /> Manage
        </Link>
      </div>

      {/* Drill-down: characters within the active brand */}
      {activeTop && children.length > 0 && (
        <nav
          aria-label={`Filter within ${activeTop.name}`}
          className="flex items-center gap-1.5 overflow-x-auto pb-1 pl-1"
        >
          <span className="shrink-0 pr-0.5 text-xs font-semibold text-[var(--foreground)]/45">
            {activeTop.icon ? `${activeTop.icon} ` : ""}
            {activeTop.name} ›
          </span>
          <Chip
            label={`All ${activeTop.name}`}
            active={active === activeTop.id}
            onClick={() => onSelect(activeTop.id)}
          />
          {children.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              emoji={c.icon}
              count={countOf(c)}
              active={active === c.id}
              onClick={() => onSelect(c.id)}
            />
          ))}
        </nav>
      )}
    </div>
  );
}

function Pill({
  label,
  emoji,
  icon,
  count,
  muted = false,
  active,
  onClick,
}: {
  label: string;
  emoji?: string | null;
  icon?: React.ReactNode;
  count?: number;
  muted?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
        active
          ? "bg-[var(--primary)] text-white"
          : `border border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--muted)] ${
              muted ? "text-[var(--foreground)]/45" : ""
            }`
      }`}
    >
      {emoji ? (
        <span aria-hidden className="text-base leading-none">
          {emoji}
        </span>
      ) : (
        icon
      )}
      <span className="whitespace-nowrap">{label}</span>
      {count != null && (
        <span
          className={`text-xs ${active ? "text-white/70" : "text-[var(--foreground)]/45"}`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function Chip({
  label,
  emoji,
  count,
  active,
  onClick,
}: {
  label: string;
  emoji?: string | null;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition ${
        active
          ? "bg-[var(--foreground)] text-[var(--background)]"
          : "border border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--muted)]"
      }`}
    >
      {emoji && (
        <span aria-hidden className="leading-none">
          {emoji}
        </span>
      )}
      <span className="whitespace-nowrap">{label}</span>
      {count != null && (
        <span className={active ? "opacity-70" : "text-[var(--foreground)]/45"}>
          {count}
        </span>
      )}
    </button>
  );
}

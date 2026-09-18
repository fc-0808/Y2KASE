"use client";

/**
 * CollectionsBrowseBar — device / MagSafe / Originals shortcuts plus directory
 * sort, wearing the same chrome as {@link CatalogToolbar}.
 *
 * Desktop keeps the visible pill rows: a directory is meant to be scanned, and
 * a Sort dropdown sits on the right the way /products places its sort control.
 * Mobile was wrapping five pills under a long intro and eating the first fold,
 * so it collapses into the Filter + Sort pair the /products PLP already uses.
 *
 * Filter destinations navigate off this page (they are shop-by shortcuts, not
 * in-place facets). Sort stays on /collections via `?sort=`.
 */

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownUp,
  Check,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CatalogBottomSheet } from "@/components/catalog/CatalogBottomSheet";
import {
  collectionsIndexHref,
  DEFAULT_DIRECTORY_SORT,
  DIRECTORY_SORT_LABELS,
  DIRECTORY_SORT_TRIGGER_LABELS,
  DIRECTORY_SORTS,
  type DirectorySort,
} from "@/lib/catalog/directory-sort";

export type BrowseDeviceLink = {
  id: string;
  href: string;
  label: string;
  icon: string;
  count: number;
};

export type BrowseMagsafeLink = {
  id: string;
  href: string;
  label: string;
  accentColor: string;
  count: number;
};

export type BrowseOriginalsLink = {
  href: string;
  name: string;
  icon: string;
  count: number;
};

const PILL_CLASS =
  "inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-bold shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--primary)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2";

const REFINE_BTN =
  "flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border px-3 text-sm font-bold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2";

export function CollectionsBrowseBar({
  devices,
  magsafe,
  originals,
  sort,
}: {
  devices: BrowseDeviceLink[];
  magsafe: BrowseMagsafeLink[];
  originals?: BrowseOriginalsLink;
  sort: DirectorySort;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const closeFilters = useCallback(() => setFilterOpen(false), []);
  const closeSort = useCallback(() => setSortOpen(false), []);
  const sortActive = sort !== DEFAULT_DIRECTORY_SORT;

  return (
    <>
      {/* Mobile — sticky Filter / Sort pair, identical chrome to /products. */}
      <div className="sticky top-[var(--storefront-header-h)] z-30 -mx-4 mt-3 border-b border-[var(--border)] bg-[var(--background)]/90 px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6 lg:static lg:z-auto lg:mx-0 lg:mt-3 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => {
              setSortOpen(false);
              setFilterOpen(true);
            }}
            aria-expanded={filterOpen}
            aria-haspopup="dialog"
            aria-label="Filters"
            className={cn(
              REFINE_BTN,
              filterOpen
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]/80",
            )}
          >
            <SlidersHorizontal aria-hidden className="h-4 w-4 shrink-0" />
            <span>Filters</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterOpen(false);
              setSortOpen(true);
            }}
            aria-expanded={sortOpen}
            aria-haspopup="dialog"
            aria-label={`Sort collections: ${DIRECTORY_SORT_LABELS[sort]}`}
            className={cn(
              REFINE_BTN,
              sortActive || sortOpen
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]/80",
            )}
          >
            <ArrowDownUp aria-hidden className="h-4 w-4 shrink-0" />
            <span className="truncate">{DIRECTORY_SORT_TRIGGER_LABELS[sort]}</span>
          </button>
        </div>

        {/* Desktop — scannable pill rows, sort on the right. */}
        <div className="hidden lg:block">
          {devices.length > 0 && (
            <nav aria-label="Shop by device" className="flex flex-wrap gap-2">
              {devices.map((device) => (
                <DevicePill key={device.id} device={device} />
              ))}
            </nav>
          )}
          <div
            className={cn(
              "flex items-center justify-between gap-3",
              devices.length > 0 && "mt-3",
            )}
          >
            <nav
              aria-label="Shop by MagSafe compatibility"
              className="flex min-w-0 flex-wrap gap-2"
            >
              {magsafe.map((facet) => (
                <MagsafePill key={facet.id} facet={facet} />
              ))}
              {originals && <OriginalsPill originals={originals} />}
            </nav>
            <DirectorySortMenu sort={sort} />
          </div>
        </div>
      </div>

      <ShopBySheet
        open={filterOpen}
        onClose={closeFilters}
        devices={devices}
        magsafe={magsafe}
        originals={originals}
      />
      <DirectorySortSheet open={sortOpen} onClose={closeSort} sort={sort} />
    </>
  );
}

function DevicePill({ device }: { device: BrowseDeviceLink }) {
  return (
    <Link
      href={device.href}
      aria-label={
        device.count > 0
          ? `${device.label} — ${device.count} products`
          : device.label
      }
      className={PILL_CLASS}
    >
      <span aria-hidden className="text-sm leading-none">
        {device.icon}
      </span>
      {device.label}
      {device.count > 0 && (
        <span className="text-xs font-bold tabular-nums text-[var(--foreground)]/45">
          {device.count}
        </span>
      )}
    </Link>
  );
}

function MagsafePill({ facet }: { facet: BrowseMagsafeLink }) {
  return (
    <Link
      href={facet.href}
      aria-label={
        facet.count > 0 ? `${facet.label} — ${facet.count} products` : facet.label
      }
      className={PILL_CLASS}
    >
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: facet.accentColor }}
      />
      {facet.label}
      {facet.count > 0 && (
        <span className="text-xs font-bold tabular-nums text-[var(--foreground)]/45">
          {facet.count}
        </span>
      )}
    </Link>
  );
}

function OriginalsPill({ originals }: { originals: BrowseOriginalsLink }) {
  return (
    <Link
      href={originals.href}
      aria-label={`${originals.name} — ${originals.count} products`}
      className={PILL_CLASS}
    >
      <span aria-hidden className="text-sm">
        {originals.icon}
      </span>
      {originals.name}
      <span className="text-xs font-bold tabular-nums text-[var(--foreground)]/45">
        {originals.count}
      </span>
    </Link>
  );
}

function DirectorySortMenu({ sort }: { sort: DirectorySort }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const active = sort !== DEFAULT_DIRECTORY_SORT;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function select(next: DirectorySort) {
    setOpen(false);
    if (next === sort) return;
    startTransition(() => {
      router.push(collectionsIndexHref(next), { scroll: false });
    });
  }

  return (
    <div ref={rootRef} className="relative hidden shrink-0 lg:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Sort collections: ${DIRECTORY_SORT_LABELS[sort]}`}
        className={cn(
          "flex h-10 items-center gap-2 rounded-full border pl-3.5 pr-3 text-sm font-bold shadow-sm transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
          active || open
            ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
            : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]/80 hover:border-[var(--primary)] hover:text-[var(--primary)]",
        )}
      >
        <ArrowDownUp
          aria-hidden
          className={cn(
            "h-4 w-4 shrink-0",
            active || open
              ? "text-[var(--primary)]"
              : "text-[var(--foreground)]/45",
          )}
        />
        <span
          className={cn(
            active || open
              ? "text-[var(--primary)]/70"
              : "text-[var(--foreground)]/45",
          )}
        >
          Sort
        </span>
        <span className="max-w-[9rem] truncate text-[var(--foreground)]">
          {DIRECTORY_SORT_LABELS[sort]}
        </span>
        <ChevronDown
          aria-hidden
          className={cn("h-4 w-4 shrink-0 transition", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          id={panelId}
          role="listbox"
          aria-label="Sort collections"
          aria-busy={isPending}
          className={cn(
            "absolute right-0 top-full z-40 mt-2 w-[min(100vw-2rem,16rem)] animate-float-up rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2",
            "shadow-[0_24px_60px_-24px_rgba(120,60,120,0.55)]",
            isPending && "opacity-60",
          )}
        >
          <DirectorySortOptions
            sort={sort}
            pending={isPending}
            onSelect={select}
            name={`${panelId}-sort`}
          />
        </div>
      )}
    </div>
  );
}

function ShopBySheet({
  open,
  onClose,
  devices,
  magsafe,
  originals,
}: {
  open: boolean;
  onClose: () => void;
  devices: BrowseDeviceLink[];
  magsafe: BrowseMagsafeLink[];
  originals?: BrowseOriginalsLink;
}) {
  return (
    <CatalogBottomSheet
      open={open}
      onClose={onClose}
      title="Filters"
      height="auto"
      footer={
        <Link
          href="/products"
          className="btn-candy flex min-h-12 w-full items-center justify-center px-4 text-sm"
        >
          Shop all products
        </Link>
      }
    >
      {devices.length > 0 && (
        <SheetSection title="Device">
          {devices.map((device) => (
            <SheetLink
              key={device.id}
              href={device.href}
              label={device.label}
              count={device.count}
              swatch={
                <span aria-hidden className="text-sm leading-none">
                  {device.icon}
                </span>
              }
            />
          ))}
        </SheetSection>
      )}
      <SheetSection title="Compatibility">
        {magsafe.map((facet) => (
          <SheetLink
            key={facet.id}
            href={facet.href}
            label={facet.label}
            count={facet.count}
            swatch={
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: facet.accentColor }}
              />
            }
          />
        ))}
      </SheetSection>
      {originals && (
        <SheetSection title="Originals">
          <SheetLink
            href={originals.href}
            label={originals.name}
            count={originals.count}
            swatch={
              <span aria-hidden className="text-sm">
                {originals.icon}
              </span>
            }
          />
        </SheetSection>
      )}
    </CatalogBottomSheet>
  );
}

function DirectorySortSheet({
  open,
  onClose,
  sort,
}: {
  open: boolean;
  onClose: () => void;
  sort: DirectorySort;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const name = useId();

  function select(next: DirectorySort) {
    onClose();
    if (next === sort) return;
    startTransition(() => {
      router.push(collectionsIndexHref(next), { scroll: false });
    });
  }

  return (
    <CatalogBottomSheet open={open} onClose={onClose} title="Sort" height="auto">
      <div aria-busy={isPending} className={cn(isPending && "opacity-60")}>
        <DirectorySortOptions
          sort={sort}
          pending={isPending}
          onSelect={select}
          name={`${name}-sort`}
        />
      </div>
    </CatalogBottomSheet>
  );
}

function DirectorySortOptions({
  sort,
  pending,
  onSelect,
  name,
}: {
  sort: DirectorySort;
  pending: boolean;
  onSelect: (sort: DirectorySort) => void;
  name: string;
}) {
  return (
    <fieldset aria-busy={pending}>
      <legend className="sr-only">Sort collections</legend>
      {DIRECTORY_SORTS.map((value) => {
        const checked = sort === value;
        return (
          <label
            key={value}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-[var(--muted)]"
          >
            <input
              type="radio"
              name={name}
              className="peer sr-only"
              checked={checked}
              onChange={() => onSelect(value)}
            />
            <span
              aria-hidden
              className={cn(
                "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-[var(--border)] bg-white text-transparent transition",
                "peer-checked:border-[var(--primary)] peer-checked:bg-[var(--primary)] peer-checked:text-white",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ring)] peer-focus-visible:ring-offset-2",
              )}
            >
              <Check className="h-3 w-3" strokeWidth={4} />
            </span>
            <span className="flex-1 truncate text-sm font-semibold text-[var(--foreground)]/75 transition peer-checked:text-[var(--foreground)]">
              {DIRECTORY_SORT_LABELS[value]}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function SheetSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-[var(--border)] py-2">
      <h3 className="px-3 pb-1 pt-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--foreground)]/45">
        {title}
      </h3>
      {children}
    </section>
  );
}

function SheetLink({
  href,
  label,
  count,
  swatch,
}: {
  href: string;
  label: string;
  count: number;
  swatch: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 text-[15px] font-bold transition hover:bg-[var(--muted)]"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--muted)]">
        {swatch}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count > 0 && (
        <span className="text-xs font-bold tabular-nums text-[var(--foreground)]/45">
          {count}
        </span>
      )}
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[var(--foreground)]/30" />
    </Link>
  );
}

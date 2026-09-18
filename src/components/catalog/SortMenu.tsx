"use client";

/**
 * SortMenu — the storefront catalog sort control.
 *
 * Desktop (`lg+`): a pill trigger and a custom panel. The previous native
 * <select> painted the OS picker over the Y2K chrome on every platform.
 *
 * Mobile: the compact refine-bar button opens {@link CatalogSortSheet}, a
 * bottom sheet with the same three radios. Combining Filter and Sort into one
 * unclear control is the pattern Baymard and Shopify both warn against; they
 * stay sibling actions that share URL state via {@link buildCatalogHref}.
 */

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownUp, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildCatalogHref,
  DEFAULT_SORT,
  SORT_LABELS,
  SORT_TRIGGER_LABELS,
  SORT_VALUES,
  type CatalogParams,
  type SortValue,
} from "@/lib/catalog/params";
import { CatalogBottomSheet } from "./CatalogBottomSheet";

export function SortMenu({ params }: { params: CatalogParams }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Same dismiss contract as the facet menus — outside click / Escape — so the
  // two controls feel like one system.
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

  function select(sort: SortValue) {
    setOpen(false);
    if (sort === params.sort) return;
    startTransition(() => {
      router.push(buildCatalogHref(params, { sort }), { scroll: false });
    });
  }

  const active = params.sort !== DEFAULT_SORT;

  return (
    <div ref={rootRef} className="relative hidden shrink-0 lg:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Sort products: ${SORT_LABELS[params.sort]}`}
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
          {SORT_LABELS[params.sort]}
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
          aria-label="Sort products"
          aria-busy={isPending}
          className={cn(
            "absolute right-0 top-full z-40 mt-2 w-[min(100vw-2rem,16rem)] animate-float-up rounded-2xl border border-[var(--border)] bg-[var(--card)] p-2",
            "shadow-[0_24px_60px_-24px_rgba(120,60,120,0.55)]",
            isPending && "opacity-60",
          )}
        >
          <SortOptions
            params={params}
            pending={isPending}
            onSelect={select}
            name={`${panelId}-sort`}
          />
        </div>
      )}
    </div>
  );
}

export function CatalogSortSheet({
  open,
  onClose,
  params,
}: {
  open: boolean;
  onClose: () => void;
  params: CatalogParams;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const name = useId();

  function select(sort: SortValue) {
    onClose();
    if (sort === params.sort) return;
    startTransition(() => {
      router.push(buildCatalogHref(params, { sort }), { scroll: false });
    });
  }

  return (
    <CatalogBottomSheet open={open} onClose={onClose} title="Sort">
      <div aria-busy={isPending} className={cn(isPending && "opacity-60")}>
        <SortOptions
          params={params}
          pending={isPending}
          onSelect={select}
          name={`${name}-sort`}
        />
      </div>
    </CatalogBottomSheet>
  );
}

export function SortTriggerButton({
  params,
  expanded,
  onClick,
}: {
  params: CatalogParams;
  expanded: boolean;
  onClick: () => void;
}) {
  const active = params.sort !== DEFAULT_SORT;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-haspopup="dialog"
      aria-label={`Sort products: ${SORT_LABELS[params.sort]}`}
      className={cn(
        "flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border px-3 text-sm font-bold shadow-sm transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
        active || expanded
          ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
          : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]/80",
      )}
    >
      <ArrowDownUp aria-hidden className="h-4 w-4 shrink-0" />
      <span className="truncate">{SORT_TRIGGER_LABELS[params.sort]}</span>
    </button>
  );
}

function SortOptions({
  params,
  pending,
  onSelect,
  name,
}: {
  params: CatalogParams;
  pending: boolean;
  onSelect: (sort: SortValue) => void;
  name: string;
}) {
  return (
    <fieldset aria-busy={pending}>
      <legend className="sr-only">Sort products</legend>
      {SORT_VALUES.map((value) => {
        const checked = params.sort === value;
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
              {SORT_LABELS[value]}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

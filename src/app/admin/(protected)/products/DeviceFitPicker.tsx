"use client";

import { useMemo } from "react";
import { compatibilityAxisFor } from "@/lib/catalog/product-types";
import {
  compatibilityChipLabel,
  normalizeOfferedCompatibility,
  summarizeCompatibility,
} from "@/lib/catalog/offered-options";

/**
 * Offered-fit editor for any product type with a compatibility axis.
 *
 * iPhone cases keep their generation-grouped picker (that UI is unique to
 * the phone-case mould map). Everything else — AirPods, Galaxy, Watch, … —
 * is a flat chip row against the type's own canon. Unknown hand-edited
 * values stay pickable so a listing cannot lose a fit it actually sells.
 */
export function DeviceFitPicker({
  productType,
  selected,
  onChange,
}: {
  productType: string;
  selected: string[];
  onChange: (models: string[]) => void;
}) {
  const axis = compatibilityAxisFor(productType);
  const offered = useMemo(() => new Set(selected), [selected]);

  if (!axis) return null;

  const extras = selected.filter((value) => !axis.values.includes(value));
  const chips = [...axis.values, ...extras];

  function commit(next: string[]) {
    onChange(normalizeOfferedCompatibility(productType, next));
  }

  function toggle(value: string) {
    const next = new Set(offered);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    commit([...next]);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => commit([...axis.values])}
          className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-semibold hover:border-[var(--primary)]"
        >
          All
        </button>
        <button
          type="button"
          onClick={() => commit([])}
          className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-semibold hover:border-[var(--primary)]"
        >
          None
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {chips.map((value) => {
          const on = offered.has(value);
          return (
            <button
              key={value}
              type="button"
              title={value}
              aria-pressed={on}
              onClick={() => toggle(value)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                on
                  ? "bg-[var(--primary)] text-white"
                  : "border border-[var(--border)] text-[var(--foreground)]/70 hover:border-[var(--primary)]"
              }`}
            >
              {compatibilityChipLabel(productType, value)}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs font-semibold text-[var(--foreground)]/70">
        {selected.length === 0
          ? "Select at least one fit"
          : summarizeCompatibility(productType, selected)}
      </p>
    </>
  );
}

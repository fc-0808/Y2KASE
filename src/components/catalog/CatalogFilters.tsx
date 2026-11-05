"use client";

/**
 * CatalogFilters — the desktop Device control.
 *
 * Characters, themes, colors and MagSafe used to be pills in this row. The
 * look rail now answers the first three, and MagSafe stays in the filter
 * sheet with them: a phone question, not a picture. Putting those four
 * dropdowns back next to the rail asked the same question twice.
 *
 * Device remains, and only when this surface sells more than one kind of
 * product. A page that is already iPhone cases does not ask "which device?"
 */

import { useEffect, useId, useRef, useState } from "react";
import { deviceFilterLabel } from "@/lib/catalog/devices";
import type { CatalogFilterModel } from "./use-catalog-filters";
import { FacetPanel, FacetTrigger, OptionRow } from "./facet-ui";
import { DeviceGlyph } from "@/components/brand/DeviceGlyph";

export type { BrandOption } from "./brand-options";
export type { FacetCounts } from "./use-catalog-filters";

export function CatalogFilters({ model }: { model: CatalogFilterModel }) {
  const {
    params,
    isPending,
    deviceFacetVisible,
    deviceTriggerLabel,
    deviceOptions,
    deviceTotal,
    deviceCounts,
    selectDevice,
  } = model;

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

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

  if (!deviceFacetVisible) return null;

  return (
    <div
      ref={rootRef}
      className="relative hidden shrink-0 lg:block"
      role="group"
      aria-label="Filter by device"
    >
      <FacetTrigger
        panelId={panelId}
        label={deviceTriggerLabel}
        active={Boolean(params.device)}
        expanded={open}
        onToggle={() => setOpen((value) => !value)}
      />
      {open && (
        <FacetPanel id={panelId} busy={isPending}>
          <fieldset>
            <legend className="sr-only">Device</legend>
            <OptionRow
              type="radio"
              name={`${panelId}-device`}
              label="All devices"
              count={deviceTotal}
              checked={params.device === undefined}
              onSelect={() => {
                setOpen(false);
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
                  name={`${panelId}-device`}
                  label={deviceFilterLabel(device.id)}
                  count={count}
                  checked={checked}
                  disabled={count === 0 && !checked}
                  onSelect={() => {
                    setOpen(false);
                    selectDevice(device.id);
                  }}
                  swatch={<DeviceGlyph id={device.id} fallback={device.icon} />}
                />
              );
            })}
          </fieldset>
        </FacetPanel>
      )}
    </div>
  );
}

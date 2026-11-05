"use client";

/**
 * Device sheet — the only refine control the phone still opens.
 *
 * Characters, themes, colors and MagSafe used to fill this sheet. The look
 * rail now answers the first three on the page itself, and MagSafe is a
 * phone detail the pictures do not need a second menu for. What remains is
 * "iPhone or AirPods?", and only on a page that sells more than one.
 */

import { deviceFilterLabel } from "@/lib/catalog/devices";
import { CatalogBottomSheet } from "./CatalogBottomSheet";
import { OptionRow } from "./facet-ui";
import { DeviceGlyph } from "@/components/brand/DeviceGlyph";
import type { CatalogFilterModel } from "./use-catalog-filters";

export function CatalogFilterSheet({
  open,
  onClose,
  model,
  resultCount,
}: {
  open: boolean;
  onClose: () => void;
  model: CatalogFilterModel;
  resultCount: number;
}) {
  const {
    params,
    isPending,
    deviceFacetVisible,
    deviceOptions,
    deviceTotal,
    deviceCounts,
    selectDevice,
  } = model;

  if (!deviceFacetVisible) return null;

  function choose(device: string | undefined) {
    selectDevice(device);
    onClose();
  }

  return (
    <CatalogBottomSheet
      open={open}
      onClose={onClose}
      title="Device"
      footer={
        <button
          type="button"
          onClick={onClose}
          aria-busy={isPending}
          className="btn-candy min-h-12 w-full px-4 text-sm"
        >
          {resultCount === 0
            ? "No products"
            : `Show ${resultCount.toLocaleString("en-US")} product${resultCount === 1 ? "" : "s"}`}
        </button>
      }
    >
      <fieldset className="px-1 pb-2">
        <legend className="sr-only">Device</legend>
        <OptionRow
          type="radio"
          name="filter-sheet-device"
          label="All devices"
          count={deviceTotal}
          checked={params.device === undefined}
          onSelect={() => choose(undefined)}
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
              onSelect={() => choose(device.id)}
              swatch={<DeviceGlyph id={device.id} fallback={device.icon} />}
            />
          );
        })}
      </fieldset>
    </CatalogBottomSheet>
  );
}

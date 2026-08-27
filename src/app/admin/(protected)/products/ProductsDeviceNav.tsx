"use client";

/**
 * ProductsDeviceNav — the device-first navigation for the Product Admin.
 *
 * The catalog is browsed the same way the storefront is: by the device taxonomy
 * (`src/lib/catalog/devices.ts`), grouped brand family → device. Reusing that
 * single source of truth keeps admin and storefront in lockstep as new product
 * lines (AirPods, Kindle, Samsung, …) come online — adding a device is a config
 * change, and it shows up here automatically.
 *
 * Only stocked devices are actionable here. Roadmap entries with no products
 * are intentionally omitted: a disabled control cannot help an operator, and
 * removing it keeps this high-frequency filter compact as the taxonomy grows.
 * The controls wrap instead of scrolling, so every available option remains
 * visible and keyboard-accessible without exposing a horizontal scrollbar.
 */
import { DEVICE_FAMILIES } from "@/lib/catalog/devices";

export type DeviceSelection = string | "all";

/** Per-device product counts, keyed by device id. */
export type DeviceCounts = Record<string, number>;

export function DeviceNavBar({
  counts,
  total,
  active,
  onSelect,
}: {
  counts: DeviceCounts;
  total: number;
  active: DeviceSelection;
  onSelect: (selection: DeviceSelection) => void;
}) {
  const visibleDevices = DEVICE_FAMILIES.flatMap(
    (family) => family.devices,
  ).filter((device) => (counts[device.id] ?? 0) > 0 || active === device.id);

  return (
    <div
      role="group"
      aria-label="Filter products by device"
      className="grid gap-2.5 px-4 py-3.5 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:items-start sm:px-5"
    >
      <span className="pt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/45">
        Device
      </span>
      <div className="flex min-w-0 flex-wrap gap-2">
        <DevicePill
          label="All products"
          count={total}
          active={active === "all"}
          onClick={() => onSelect("all")}
        />
        {visibleDevices.map((device) => (
          <DevicePill
            key={device.id}
            label={device.label}
            count={counts[device.id] ?? 0}
            active={active === device.id}
            onClick={() => onSelect(device.id)}
          />
        ))}
      </div>
    </div>
  );
}

function DevicePill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        active
          ? "border-primary bg-primary-soft text-foreground shadow-sm"
          : "border-border bg-background/60 text-foreground/75 hover:border-primary/50 hover:bg-muted"
      }`}
    >
      <span className="whitespace-nowrap">{label}</span>
      <span
        className={`text-xs tabular-nums ${
          active ? "text-foreground/60" : "text-foreground/40"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

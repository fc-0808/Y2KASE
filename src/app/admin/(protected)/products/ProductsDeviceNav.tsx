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
 * Presented as a single horizontal bar that scrolls on overflow, so it stays
 * out of the way on every viewport (no sidebar eating horizontal space).
 */
import { Fragment } from "react";
import { LayoutGrid } from "lucide-react";
import { DEVICE_FAMILIES } from "@/lib/catalog/devices";
import { DeviceIcon } from "@/components/brand/DeviceIcon";

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
  return (
    <nav
      aria-label="Filter products by device"
      className="mb-4 flex items-center gap-1.5 overflow-x-auto pb-1"
    >
      <DevicePill
        icon={<LayoutGrid className="h-4 w-4" />}
        label="All products"
        count={total}
        active={active === "all"}
        onClick={() => onSelect("all")}
      />

      {DEVICE_FAMILIES.map((family) => (
        <Fragment key={family.id}>
          <span
            aria-hidden
            className="mx-1 hidden h-5 w-px shrink-0 bg-[var(--border)] sm:block"
          />
          <span className="hidden shrink-0 px-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--foreground)]/35 lg:block">
            {family.label}
          </span>
          {family.devices.map((device) => {
            const count = counts[device.id] ?? 0;
            const empty = count === 0;
            const isActive = active === device.id;
            return (
              <DevicePill
                key={device.id}
                icon={
                  <DeviceIcon
                    id={device.id}
                    className={`h-5 w-5 ${empty && !isActive ? "opacity-50 grayscale" : ""}`}
                  />
                }
                label={device.label}
                count={count}
                soon={empty && device.comingSoon}
                muted={empty}
                // Coming-soon lines with nothing stocked are dead-ends — keep
                // them visible (the roadmap) but non-interactive.
                disabled={empty && device.comingSoon}
                active={isActive}
                onClick={() => onSelect(device.id)}
              />
            );
          })}
        </Fragment>
      ))}
    </nav>
  );
}

function DevicePill({
  icon,
  label,
  count,
  soon = false,
  muted = false,
  disabled = false,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  soon?: boolean;
  muted?: boolean;
  disabled?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "true" : undefined}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
        active
          ? "bg-[var(--primary)] text-white"
          : disabled
            ? "cursor-default text-[var(--foreground)]/35"
            : `border border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--muted)] ${
                muted ? "text-[var(--foreground)]/45" : ""
              }`
      }`}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
      {soon ? (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
            active
              ? "bg-white/20"
              : "bg-[var(--muted)] text-[var(--foreground)]/40"
          }`}
        >
          Soon
        </span>
      ) : (
        <span
          className={`text-xs ${active ? "text-white/70" : "text-[var(--foreground)]/45"}`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

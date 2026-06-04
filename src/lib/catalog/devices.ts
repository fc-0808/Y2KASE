/**
 * Device taxonomy — the "Shop by device" browse axis.
 *
 * Unlike collections (which are content-managed rows in the DB), device
 * classification is *derived* from a product's {@link ProductTypeId}: every
 * iPhone case already declares `productType = "iphone_case"`, so we don't need
 * to store device membership separately. This file is the single, config-driven
 * source of truth that maps the buyer-facing device tree (Apple → iPhone,
 * AirPods, …; Samsung → Galaxy; Google → Pixel) onto those product types.
 *
 * Keeping it as code (mirroring the product-type REGISTRY) means the device
 * mega-menu, `/products?device=…` filtering and any future device landing pages
 * all stay in sync from one place.
 */
import type { ProductTypeId } from "./types";

/** A single selectable device, e.g. "iPhone" or "Apple Watch". */
export type DeviceNode = {
  /** URL slug used in `/products?device=<id>`. */
  id: string;
  label: string;
  /** Product types that belong to this device. */
  productTypes: ProductTypeId[];
  /** Emoji shown as a lightweight icon in menus. */
  icon: string;
  /** Hide from the menu until at least one product type is enabled/stocked. */
  comingSoon?: boolean;
};

/** A brand grouping of devices, e.g. "Apple", "Samsung". */
export type DeviceFamily = {
  id: string;
  label: string;
  /** Emoji/logo glyph for the family header. */
  icon: string;
  devices: DeviceNode[];
};

export const DEVICE_FAMILIES: DeviceFamily[] = [
  {
    id: "apple",
    label: "Apple",
    icon: "",
    devices: [
      { id: "iphone", label: "iPhone", productTypes: ["iphone_case"], icon: "📱" },
      { id: "airpods", label: "AirPods", productTypes: ["airpod_case"], icon: "🎧", comingSoon: true },
      { id: "macbook", label: "MacBook", productTypes: ["macbook_case"], icon: "💻", comingSoon: true },
      { id: "apple-watch", label: "Apple Watch", productTypes: ["watch_band"], icon: "⌚", comingSoon: true },
      { id: "ipad", label: "iPad", productTypes: ["ipad_case"], icon: "📟", comingSoon: true },
      {
        id: "apple-accessories",
        label: "Apple Accessories",
        productTypes: ["apple_accessory"],
        icon: "✨",
        comingSoon: true,
      },
    ],
  },
  {
    id: "samsung",
    label: "Samsung",
    icon: "",
    devices: [
      { id: "galaxy", label: "Galaxy", productTypes: ["samsung_case"], icon: "📱", comingSoon: true },
    ],
  },
  {
    id: "google",
    label: "Google",
    icon: "",
    devices: [
      { id: "pixel", label: "Pixel", productTypes: ["pixel_case"], icon: "📱", comingSoon: true },
    ],
  },
  {
    id: "more",
    label: "More devices",
    icon: "",
    devices: [
      { id: "kindle", label: "Kindle", productTypes: ["kindle_case"], icon: "📖", comingSoon: true },
    ],
  },
];

const DEVICE_BY_ID = new Map<string, DeviceNode>(
  DEVICE_FAMILIES.flatMap((f) => f.devices.map((d) => [d.id, d])),
);

const FAMILY_OF_DEVICE = new Map<string, DeviceFamily>(
  DEVICE_FAMILIES.flatMap((f) => f.devices.map((d) => [d.id, f])),
);

/** Look up a device node by its slug. */
export function findDevice(id: string): DeviceNode | undefined {
  return DEVICE_BY_ID.get(id);
}

/** The family a device belongs to (for breadcrumbs / headers). */
export function familyOfDevice(id: string): DeviceFamily | undefined {
  return FAMILY_OF_DEVICE.get(id);
}

/**
 * The product types a `device` filter should match, or null if the id is
 * unknown (caller should then ignore the filter rather than match nothing).
 */
export function deviceProductTypes(id: string): ProductTypeId[] | null {
  return DEVICE_BY_ID.get(id)?.productTypes ?? null;
}

/** Human label for a device id, falling back to the raw id. */
export function deviceLabel(id: string): string {
  return DEVICE_BY_ID.get(id)?.label ?? id;
}

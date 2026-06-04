/**
 * Catalog product-type definitions.
 *
 * A product type is the *functional* discriminator for a product (it drives
 * variation axes, pricing and per-image media tagging) — as opposed to a
 * collection/tag, which is a *marketing* grouping. Everything type-specific
 * lives in one {@link ProductTypeConfig} so the admin UI, ingest pipeline and
 * storefront can stay generic: adding a new type is (ideally) a config change.
 */

export type ProductTypeId =
  | "iphone_case"
  | "samsung_case"
  | "pixel_case"
  | "airpod_case"
  | "ipad_case"
  | "macbook_case"
  | "kindle_case"
  | "watch_band"
  | "apple_accessory";

/**
 * The semantic role an option axis plays for a type. The admin uses these to
 * decide how to render each axis without hard-coding axis names:
 *  - "price"        → the axis whose selected value drives the listing price
 *  - "compatibility"→ the device-fit axis (iPhone model, Watch size, …)
 *  - "standard"     → a plain variant axis (color, finish, …)
 */
export type OptionRole = "price" | "compatibility" | "standard";

export type OptionAxis = {
  name: string;
  values: string[];
  /** Defaults to "standard" when omitted. */
  role?: OptionRole;
};

export type ProductTypeConfig = {
  id: ProductTypeId;
  label: string;
  /** Shown in admin upload UI */
  description: string;
  /** Whether this type is fully implemented yet */
  enabled: boolean;
  /** Short singular noun for badges/grouping, e.g. "Case", "Band". */
  noun: string;
  /** Option axes inserted on ingest */
  options: OptionAxis[];
  /**
   * The option axis whose values are used to tag individual images (i.e. "this
   * photo shows the Case + Grip bundle"). Undefined → no per-image tagging for
   * this type. For iPhone cases this is the "Style" axis.
   */
  mediaTagAxis?: string;
  /** Base listing price for the default style / SKU */
  getBasePrice: (currency: string) => number;
  /** Resolve price from selected options (e.g. Style) */
  getPriceFromOptions: (
    options: Record<string, string>,
    currency: string,
  ) => number;
};

/** Find the axis playing a given role, if any. */
export function axisByRole(
  config: ProductTypeConfig,
  role: OptionRole,
): OptionAxis | undefined {
  return config.options.find((o) => o.role === role);
}

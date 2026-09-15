/**
 * Read and normalize the variation axes a product actually offers.
 *
 * Ingest writes whatever {@link ProductTypeConfig.options} declares — "Style"
 * + "iPhone Model" for phone cases, "AirPods Model" + "Style" for AirPods,
 * "Watch Size" for bands, and so on. Admin surfaces historically looked up the iPhone names
 * and then ran the iPhone-only orderers, which drops every other type's values
 * (AirPods "Pro 3" is not in `IPHONE_MODELS`) and draws an empty cell.
 *
 * This module is the axis-name-agnostic replacement: given a product type and
 * the stored `product_options` rows, return the price-axis and compatibility-
 * axis values in canonical order. Pure — safe on the client and the server.
 */
import { airpodsChipLabel, extendAirpodsSharedFits } from "./airpods";
import {
  compatibilityAxisFor,
  getProductType,
  priceAxisFor,
} from "./product-types";
import { orderModels, orderStyles, summarizeModels } from "../pricing";

export type NamedOptionValues = {
  name: string;
  values?: readonly string[] | null;
};

function asStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function findNamedValues(
  options: readonly NamedOptionValues[],
  name: string,
): string[] {
  return asStringList(options.find((option) => option.name === name)?.values);
}

/**
 * Sort `values` into `canon` order, then append anything the canon has never
 * heard of so a hand-edited row cannot lose a fit the listing actually sells.
 */
export function orderAgainstCanon(
  canon: readonly string[],
  values: readonly string[],
): string[] {
  const offered = asStringList(values);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const value of canon) {
    if (!offered.includes(value) || seen.has(value)) continue;
    seen.add(value);
    ordered.push(value);
  }
  for (const value of offered) {
    if (seen.has(value)) continue;
    seen.add(value);
    ordered.push(value);
  }
  return ordered;
}

export function hasPriceAxis(productTypeId: string): boolean {
  return priceAxisFor(productTypeId) != null;
}

export function hasCompatibilityAxis(productTypeId: string): boolean {
  return compatibilityAxisFor(productTypeId) != null;
}

/**
 * Collapse an arbitrary offered set onto the type's compatibility canon.
 *
 * iPhone keeps its historical drop-unknowns behaviour (`orderModels`). AirPods
 * canonicalize the shared 4/5 mould. Every other type orders against its
 * config list and preserves unknowns.
 */
export function normalizeOfferedCompatibility(
  productTypeId: string,
  values: readonly string[],
): string[] {
  if (productTypeId === "iphone_case") return orderModels(values);
  if (productTypeId === "airpod_case") return extendAirpodsSharedFits(values);
  const axis = compatibilityAxisFor(productTypeId);
  return orderAgainstCanon(axis?.values ?? [], values);
}

/**
 * Collapse an arbitrary offered set onto the type's price-axis canon.
 * Unknown values are dropped — a grip style cannot hitch a ride onto an
 * AirPods listing just because the writer sent the iPhone set.
 */
export function normalizeOfferedPriceValues(
  productTypeId: string,
  values: readonly string[],
): string[] {
  const axis = priceAxisFor(productTypeId);
  if (!axis) return [];
  if (productTypeId === "iphone_case") return orderStyles(values);
  const allowed = new Set(axis.values);
  return orderAgainstCanon(
    axis.values,
    asStringList(values).filter((value) => allowed.has(value)),
  );
}

export function offeredPriceValues(
  productTypeId: string,
  options: readonly NamedOptionValues[],
): string[] {
  const axis = priceAxisFor(productTypeId);
  if (!axis) return [];
  const stored = normalizeOfferedPriceValues(
    productTypeId,
    findNamedValues(options, axis.name),
  );
  // A row ingested before this type grew a price axis still has to render
  // the default offered set; saving persists it.
  return stored.length > 0 ? stored : [...axis.values];
}

/** Live unit price for one offered style, or null when the type is flat. */
export function priceForOfferedStyle(
  productTypeId: string,
  style: string,
  currency: string,
): number | null {
  const axis = priceAxisFor(productTypeId);
  if (!axis) return null;
  return getProductType(productTypeId).getPriceFromOptions(
    { [axis.name]: style },
    currency,
  );
}

export function offeredCompatibilityValues(
  productTypeId: string,
  options: readonly NamedOptionValues[],
): string[] {
  const axis = compatibilityAxisFor(productTypeId);
  if (!axis) return [];
  return normalizeOfferedCompatibility(
    productTypeId,
    findNamedValues(options, axis.name),
  );
}

/**
 * Compact table/badge copy for an offered compatibility set.
 *
 * iPhone keeps generation ranges ("iPhone 15–17"). AirPods and other
 * non-iPhone types speak in "fits" / counts against their own canon, never
 * against the iPhone master list.
 */
export function summarizeCompatibility(
  productTypeId: string,
  values: readonly string[],
): string {
  if (productTypeId === "iphone_case") return summarizeModels(values);
  const axis = compatibilityAxisFor(productTypeId);
  const ordered = normalizeOfferedCompatibility(productTypeId, values);
  if (ordered.length === 0) return "Not set";
  const noun = productTypeId === "airpod_case" ? "fits" : "models";
  if (
    axis &&
    ordered.length === axis.values.length &&
    axis.values.every((value) => ordered.includes(value))
  ) {
    return noun === "fits" ? "All fits" : "All models";
  }
  if (axis && axis.values.length > 0) {
    return `${ordered.length} of ${axis.values.length} ${noun}`;
  }
  return `${ordered.length} ${noun}`;
}

/** Chip label with a repeated device prefix stripped when it is noise. */
export function compatibilityChipLabel(
  productTypeId: string,
  value: string,
): string {
  if (productTypeId === "airpod_case") return airpodsChipLabel(value);
  if (productTypeId === "iphone_case") {
    return value.replace(/^iPhone\s+/i, "").trim() || value;
  }
  return value;
}

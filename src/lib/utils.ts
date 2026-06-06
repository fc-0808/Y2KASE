import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Natural, numeric-aware comparison of filenames (client-safe; no node:path).
 * Sorts `1, 2, 3, … 10, 11` the way a human expects. Nulls sort last.
 */
export function compareFilenamesNatural(
  a: string | null,
  b: string | null,
): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function formatPrice(
  amount: number | string,
  currency = process.env.NEXT_PUBLIC_STORE_CURRENCY ?? "USD",
) {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(Number.isFinite(value) ? value : 0);
}

/** Format an integer amount of minor units (cents) as a currency string. */
export function formatCents(
  cents: number,
  currency = process.env.NEXT_PUBLIC_STORE_CURRENCY ?? "USD",
) {
  return formatPrice((Number.isFinite(cents) ? cents : 0) / 100, currency);
}

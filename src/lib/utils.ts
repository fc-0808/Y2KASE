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

/** Turn an ISO 3166-1 alpha-2 code into its flag emoji ("US" → 🇺🇸). */
export function countryFlag(code?: string | null): string {
  if (!code) return "";
  const cc = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  return String.fromCodePoint(
    ...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

let regionNames: Intl.DisplayNames | null | undefined;
/** Human country name from an ISO code ("US" → "United States"). */
export function countryName(code?: string | null): string {
  if (!code) return "";
  try {
    if (regionNames === undefined) {
      regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    }
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/**
 * Human label for an order's customer column. Guest checkouts start with no
 * email (it's collected by Stripe at payment), so instead of rendering a blank
 * cell we explain the state. `muted` flags a placeholder rather than real data.
 */
export function orderCustomerLabel(order: {
  email?: string | null;
  status: string;
}): { text: string; muted: boolean } {
  if (order.email) return { text: order.email, muted: false };
  switch (order.status) {
    case "pending":
      return { text: "Guest · awaiting payment", muted: true };
    case "cancelled":
      return { text: "Guest · abandoned", muted: true };
    default:
      return { text: "Guest", muted: true };
  }
}

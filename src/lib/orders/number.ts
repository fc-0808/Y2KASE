import { randomInt } from "node:crypto";

/**
 * Buyer-facing order references.
 *
 * A sequential serial (#64) tells every buyer how young the shop is, and the
 * gap between two of their own orders tells them the weekly volume. A random
 * six-digit reference does neither. Digits, not a mixed code, so it stays
 * easy to read aloud and is not mistaken for a 4PX tracking number
 * (4PX3003…CN). The serial primary key stays internal.
 */
const MIN = 100_000;
const MAX_EXCLUSIVE = 1_000_000;

export const ORDER_NUMBER_PATTERN = /^YK-\d{6}$/;

export function generateOrderNumber(): string {
  return `YK-${randomInt(MIN, MAX_EXCLUSIVE)}`;
}

/** Accept `yk-482913` from a pasted link or email. */
export function canonicalOrderNumber(value: string): string | null {
  const trimmed = value.trim().toUpperCase();
  return ORDER_NUMBER_PATTERN.test(trimmed) ? trimmed : null;
}

/** True when an insert lost the race on `orders_order_number_idx`. */
export function isOrderNumberConflict(err: unknown): boolean {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current !== "object") break;
    const record = current as {
      message?: unknown;
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (typeof record.message === "string") parts.push(record.message);
    if (typeof record.code === "string") parts.push(record.code);
    if (typeof record.constraint === "string") parts.push(record.constraint);
    current = record.cause;
  }
  const blob = parts.join(" ");
  return (
    blob.includes("orders_order_number_idx") ||
    (blob.includes("23505") && blob.includes("order_number"))
  );
}

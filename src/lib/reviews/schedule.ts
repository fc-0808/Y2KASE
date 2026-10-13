/**
 * When a review request is allowed to go out.
 *
 * The published delivery window is the wait. Asking 7 days after ship reaches
 * US buyers on arrival and Australia before the parcel. The ask goes out at
 * the destination's maximum published transit, plus a few days to use the
 * case, and never after 45 days.
 */
import { SHIPPING_REGIONS } from "@/lib/shipping";

export const REVIEW_REQUEST_GRACE_DAYS = 3;
export const REVIEW_REQUEST_MAX_AGE_DAYS = 45;
export const REVIEW_REMINDER_AFTER_DAYS = 10;
export const REVIEW_INVITE_TTL_SECONDS = 60 * 24 * 60 * 60;

const DAY_MS = 24 * 60 * 60 * 1000;

const TRANSIT_DAYS = SHIPPING_REGIONS.map((region) => region.maxDays);

/** Soonest any supported market can be asked: Hong Kong's window plus grace. */
export const EARLIEST_REVIEW_REQUEST_DAYS =
  Math.min(...TRANSIT_DAYS) + REVIEW_REQUEST_GRACE_DAYS;

/**
 * ISO country from checkout. A full country name, or a missing one, uses the
 * longest published window so the email waits rather than arriving early.
 */
export function deliveryWindowDays(country: string | null | undefined): number {
  const code = country?.trim().toUpperCase() ?? "";
  if (/^[A-Z]{2}$/.test(code)) {
    const region = SHIPPING_REGIONS.find((item) =>
      (item.countries as readonly string[]).includes(code),
    );
    if (region) return region.maxDays;
  }
  return Math.max(...TRANSIT_DAYS);
}

export function reviewRequestDueAt(
  shippedAt: Date,
  country: string | null | undefined,
): Date {
  const days = deliveryWindowDays(country) + REVIEW_REQUEST_GRACE_DAYS;
  return new Date(shippedAt.getTime() + days * DAY_MS);
}

export function isReviewRequestDue(
  shippedAt: Date,
  country: string | null | undefined,
  now: Date,
): boolean {
  const age = now.getTime() - shippedAt.getTime();
  if (age < 0 || age > REVIEW_REQUEST_MAX_AGE_DAYS * DAY_MS) return false;
  return now.getTime() >= reviewRequestDueAt(shippedAt, country).getTime();
}

export function isReviewReminderDue(
  firstSentAt: Date,
  shippedAt: Date,
  now: Date,
): boolean {
  const age = now.getTime() - shippedAt.getTime();
  if (age > REVIEW_REQUEST_MAX_AGE_DAYS * DAY_MS) return false;
  return now.getTime() - firstSentAt.getTime() >= REVIEW_REMINDER_AFTER_DAYS * DAY_MS;
}

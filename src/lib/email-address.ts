/**
 * Email-address helpers shared by auth, checkout, and marketing capture.
 *
 * Postgres `text` comparisons are case-sensitive, Better Auth stores whatever
 * the provider sent, and Stripe often capitalizes the local part. Normalizing
 * to lowercase at every write — and matching with `lower(email)` on read —
 * is what makes a guest order reappear after the shopper later signs in.
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMAIL_MAX = 320;

/** Trim + lowercase. Empty input stays empty. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  return email.length > 3 && email.length <= EMAIL_MAX && EMAIL_RE.test(email);
}

/**
 * Accept a query-string `?email=` prefill. Rejects anything that isn't a
 * plausible address so we never render attacker-controlled junk into the form.
 */
export function sanitizeEmailParam(raw: string | null | undefined): string {
  if (!raw) return "";
  const email = normalizeEmail(raw).slice(0, EMAIL_MAX);
  return EMAIL_RE.test(email) ? email : "";
}

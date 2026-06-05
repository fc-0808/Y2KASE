/**
 * Server startup hook (runs once before the first request, in both the Node.js
 * and Edge runtimes).
 *
 * Why this exists — env var hygiene:
 * Secrets and connection strings are frequently added to hosting providers by
 * piping a file or `echo`-ing a value, which on Windows/CRLF setups silently
 * appends a trailing "\r\n" to the stored value. A secret like
 *   STRIPE_SECRET_KEY="sk_live_…\r\n"
 * looks correct in dashboards but is fatal at runtime: Node refuses to put a
 * carriage-return/newline into an HTTP header, so every Stripe API call (and
 * any other header-bound credential) throws — surfacing to buyers as the
 * generic "Could not start checkout. Please try again."
 *
 * We normalize every env value exactly once here so a stray newline can never
 * take down checkout, the database, auth, webhooks, or email again. Trimming
 * surrounding whitespace is always safe — no legitimate secret, URL, or key
 * begins or ends with whitespace.
 */
export function register() {
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed !== value) {
      process.env[key] = trimmed;
    }
  }
}

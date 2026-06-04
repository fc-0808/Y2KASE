/**
 * Stripe server-side client (singleton).
 *
 * SERVER ONLY — never import this in a client component. The secret key must
 * never reach the browser. The publishable key (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
 * is the only Stripe value safe to expose client-side.
 *
 * We pin the API version so Stripe never silently changes response shapes
 * underneath us — this is what every production Stripe integration does.
 */
import Stripe from "stripe";

let _stripe: Stripe | null = null;

/** Lazily construct the Stripe client so the app can boot without the key set. */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to .env.local (use a sk_test_ key for local dev).",
    );
  }
  _stripe = new Stripe(key, {
    // Pinning the API version protects us from breaking changes on Stripe's side.
    // Matches the version bundled with the installed `stripe` SDK.
    apiVersion: "2026-05-27.dahlia",
    appInfo: { name: "Y2KASE", url: "https://y2kase.com" },
    typescript: true,
  });
  return _stripe;
}

/** True when Stripe is configured (used to gracefully disable checkout in dev). */
export const isStripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

/** Whether the configured key is a live key — used to warn in non-prod contexts. */
export const isStripeLiveMode = () =>
  Boolean(process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_"));

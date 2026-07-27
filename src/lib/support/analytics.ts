"use client";

/**
 * Support funnel instrumentation.
 *
 * Emits to BOTH analytics backends, deliberately:
 *
 *  • GA4 — the full-fidelity destination, but it no-ops unless NEXT_PUBLIC_GA_ID
 *    is set, and Consent Mode keeps it silent until the visitor opts in. Great
 *    data when both are true; no data at all when either isn't.
 *
 *  • Vercel Web Analytics — cookieless and already mounted site-wide, so it
 *    reports even for visitors who decline cookies.
 *
 * The duplication is the point. Deciding whether to keep renting a chat vendor
 * or build our own rests entirely on this funnel — how many shoppers open the
 * panel, which questions they expand, and how many still needed a human. A
 * measurement plan that silently records nothing is worse than none, because
 * you don't find out until the six weeks are up.
 *
 * Both calls are individually safe when their backend is absent.
 */

import { track } from "@vercel/analytics";
import { gaEvent } from "@/lib/analytics/gtag";

/** Vercel Web Analytics only accepts primitives as custom-event properties. */
type SupportEventParams = Record<string, string | number | boolean>;

export function trackSupport(
  event: string,
  params: SupportEventParams = {},
): void {
  gaEvent(event, params);
  try {
    track(event, params);
  } catch {
    // Analytics must never be able to break a shopper reaching support.
  }
}

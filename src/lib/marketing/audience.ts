/**
 * Marketing-list eligibility.
 *
 * The storefront is single opt-in: submitting the welcome pop-up, footer,
 * welcome card, or checkout form is the consent event. The database status
 * column is therefore the sendability source of truth:
 *
 *   active        — consented and sendable
 *   unsubscribed  — suppressed (customer, admin, provider, bounce, complaint)
 *
 * `consent_version` / `consent_recorded_at` are audit evidence written at
 * signup. They must not be a second eligibility gate. Treating missing ledger
 * fields as "unverified" split the list after those columns shipped, hiding
 * legitimate pre-ledger (and some in-flight) opt-ins from admin, campaigns,
 * and Resend reconciliation.
 *
 * Safe to import from client components: no server-only secrets.
 */

export const MARKETING_SENDABLE_STATUS = "active" as const;

export type SubscriberLifecycleStatus = "active" | "unsubscribed";

export function isMarketingSendable(
  subscriber:
    | {
        status: string | null | undefined;
      }
    | null
    | undefined,
): boolean {
  return subscriber?.status === MARKETING_SENDABLE_STATUS;
}

export function subscriberLifecycleStatus(
  subscriber:
    | {
        status: string | null | undefined;
      }
    | null
    | undefined,
): SubscriberLifecycleStatus {
  return isMarketingSendable(subscriber) ? "active" : "unsubscribed";
}

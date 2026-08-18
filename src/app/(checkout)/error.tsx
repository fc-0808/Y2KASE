"use client";

/**
 * Checkout error boundary.
 *
 * Scoped to the group so a failure in the bag or a post-Stripe result page keeps
 * the minimal checkout header and footer rather than dropping the shopper onto a
 * chrome-less page mid-purchase.
 */

import { ErrorPanel } from "@/components/ErrorPanel";

export default function CheckoutError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="flex-1">
      <ErrorPanel error={error} retry={retry} />
    </main>
  );
}

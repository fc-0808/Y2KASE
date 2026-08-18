"use client";

/**
 * Fallback error boundary for routes that sit outside the storefront and
 * checkout groups (for example `/preview/fresh-visit`), which have no shared
 * chrome of their own. Grouped routes are caught by the boundary inside their
 * group, which keeps the surrounding header and footer.
 *
 * Named `RouteError` rather than `GlobalError` because `global-error.tsx` is a
 * different boundary with different semantics — it replaces the root layout
 * entirely — and two identically named components are hard to tell apart in a
 * stack trace.
 */

import { ErrorPanel } from "@/components/ErrorPanel";

export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center">
      <ErrorPanel error={error} retry={retry} />
    </main>
  );
}

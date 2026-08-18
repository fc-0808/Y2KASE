"use client";

/**
 * Storefront error boundary.
 *
 * Lives inside the group so the surrounding layout still supplies the header,
 * footer and cart. A boundary at the root would render above that layout, and a
 * shopper who hit an error would lose every way to navigate the store except
 * the single "Home" link in the panel — the failure mode this file exists to
 * prevent. `SiteHeader` cannot simply be imported here the way `not-found.tsx`
 * does it, because error boundaries must be Client Components and `SiteHeader`
 * is an async Server Component.
 */

import { ErrorPanel } from "@/components/ErrorPanel";

export default function StorefrontError({
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

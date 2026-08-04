"use client";

/**
 * DiscountRedirect — applies a promo code from a marketing link, then sends
 * the shopper on their way.
 *
 * Used by `/discount/[code]?redirect=/…` so a CTA like "Shop Now (10% Off
 * Applied)" can both persist the code to the bag and land on the catalog in
 * one tap, without asking the shopper to remember or re-type anything.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { resolveLocalCoupon } from "@/lib/promotions";
import { usePromoActions } from "@/lib/store/promo";

/** Reject open redirects — only same-origin relative paths are allowed. */
function safeRedirectPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export function DiscountRedirect({
  code,
  redirect,
}: {
  code: string;
  redirect?: string;
}) {
  const router = useRouter();
  const { autoApply } = usePromoActions();

  useEffect(() => {
    const coupon = resolveLocalCoupon(code);
    if (coupon) autoApply(coupon.code, "manual");
    router.replace(safeRedirectPath(redirect));
  }, [code, redirect, autoApply, router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4">
      <p className="text-sm font-semibold text-[var(--foreground)]/60">
        Applying your discount…
      </p>
    </div>
  );
}

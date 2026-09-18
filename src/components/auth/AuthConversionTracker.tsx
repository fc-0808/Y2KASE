"use client";

/**
 * Fires GA4 `sign_up` exactly once when Better Auth lands a brand-new user
 * on `?welcome=1`, then strips the flag so a refresh doesn't double-count.
 */

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { gaEvent } from "@/lib/analytics/gtag";
import { NEW_ACCOUNT_WELCOME_PARAM } from "@/lib/auth-redirect";

export function AuthConversionTracker() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const fired = useRef(false);
  const welcome = searchParams.get(NEW_ACCOUNT_WELCOME_PARAM);

  useEffect(() => {
    if (welcome !== "1" || fired.current) return;
    fired.current = true;
    gaEvent("sign_up", { method: "account" });

    const params = new URLSearchParams(searchParams.toString());
    params.delete(NEW_ACCOUNT_WELCOME_PARAM);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [welcome, pathname, router, searchParams]);

  return null;
}

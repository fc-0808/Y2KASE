"use client";

import { usePathname } from "next/navigation";
import { isCheckoutFlowRoute } from "@/lib/routes";

/**
 * The mirror of {@link StorefrontOnly}: renders the minimal, distraction-free
 * checkout chrome ONLY inside the funnel (/cart, /checkout/*).
 *
 * Same thin client-gate approach, so pages stay statically renderable and the
 * two components can never disagree about what "the checkout funnel" is — both
 * read the shared predicate in `@/lib/routes`.
 */
export function CheckoutFlowOnly({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (!isCheckoutFlowRoute(pathname)) return null;
  return <>{children}</>;
}

"use client";

import { usePathname } from "next/navigation";
import { isAdminRoute, isCheckoutFlowRoute } from "@/lib/routes";

/**
 * Renders shopper-facing chrome (announcement bar, mega-menu header, footer,
 * cart drawer, marketing pop-ups) on every route EXCEPT:
 *
 *   • /admin — ships its own shell (`AdminNavbar`) and must not inherit the
 *     storefront's sticky header, promo bar, cart or newsletter pop-up.
 *   • the checkout funnel (/cart, /checkout/*) — deliberately distraction-free.
 *     The mega-menu, mega-footer, cart drawer, e-mail pop-up and support bubble
 *     are all suppressed in favour of the minimal chrome rendered by
 *     {@link CheckoutFlowOnly}, so the page has exactly one job: complete the
 *     order. Removing competing exit points is the single highest-leverage
 *     conversion change on a cart page.
 *
 * Implemented as a thin client gate (rather than a `headers()` check in the
 * root layout) so storefront pages stay statically renderable / ISR-eligible;
 * this component only decides whether the already-rendered subtree is shown.
 * The `/admin` detection mirrors `VisitorTracker` and `proxy.ts` via the shared
 * predicates in `@/lib/routes` for a single, consistent definition.
 */
export function StorefrontOnly({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isAdminRoute(pathname) || isCheckoutFlowRoute(pathname)) return null;
  return <>{children}</>;
}

"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { scheduleAfterLoad } from "@/lib/analytics/idle";
import { useCart } from "@/lib/store/cart";

const loadCartDrawer = () =>
  import("@/components/CartDrawer").then((module) => module.CartDrawer);

const DeferredCartDrawer = dynamic(loadCartDrawer, { ssr: false });

/**
 * Keep the full drawer out of the critical storefront bundle. Its chunk warms
 * during browser idle time, while an early cart open still loads it on demand.
 */
export function CartDrawerLoader() {
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const isOpen = useCart((state) => state.isOpen);
  const close = useCart((state) => state.close);

  useEffect(
    () =>
      scheduleAfterLoad(() => {
        void loadCartDrawer();
      }),
    [],
  );

  useEffect(() => {
    if (previousPath.current !== pathname) close();
    previousPath.current = pathname;
  }, [pathname, close]);

  return isOpen ? <DeferredCartDrawer /> : null;
}

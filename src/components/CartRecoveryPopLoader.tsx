"use client";

import dynamic from "next/dynamic";

/**
 * The recovery trigger depends on browser-only pointer, visibility, storage,
 * and persisted cart APIs. Keep it out of the server render and initial bundle.
 */
const CartRecoveryPop = dynamic(
  () => import("./CartRecoveryPop").then((module) => module.CartRecoveryPop),
  { ssr: false },
);

export function CartRecoveryPopLoader() {
  return <CartRecoveryPop />;
}

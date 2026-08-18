"use client";

/**
 * Stage two of a fresh visit: clear the browser's half of visitor state, then
 * leave.
 *
 * This component exists so the wipe runs on a page the storefront has not
 * booted on. Nothing here imports the cart or promo stores, so there is no
 * rehydrated copy in module scope racing the reset, and the hard navigation
 * that follows guarantees the destination starts from an empty module graph.
 *
 * `location.replace`, never `router.replace`: a client-side transition would
 * reuse this document — the very state we just cleared would still be live in
 * memory — and it would leave the bootstrap in session history, where the back
 * button would silently re-run the reset.
 */

import { useEffect, useRef } from "react";
import { clearStorefrontVisitorState } from "@/lib/preview/visitor-state";

export function FreshVisitBootstrap({ destination }: { destination: string }) {
  // React runs effects twice in development's Strict Mode. The wipe is
  // idempotent, but a second `location.replace` during an in-flight navigation
  // is not something worth finding out about in production.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    clearStorefrontVisitorState();
    window.location.replace(destination);
  }, [destination]);

  return null;
}

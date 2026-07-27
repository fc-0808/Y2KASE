"use client";

/**
 * Client-side loader for SupportWidget.
 *
 * `ssr: false` is only valid inside Client Components in the App Router, and
 * it's the right call twice over here: the widget reads the persisted cart and
 * localStorage on mount (server HTML could never match), and keeping it out of
 * the document means the help surface costs the initial payload nothing but a
 * deferred chunk.
 */

import dynamic from "next/dynamic";

const SupportWidget = dynamic(
  () => import("./SupportWidget").then((m) => m.SupportWidget),
  { ssr: false },
);

export function SupportWidgetLoader() {
  return <SupportWidget />;
}

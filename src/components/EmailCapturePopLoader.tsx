"use client";
/**
 * Thin client-side loader for EmailCapturePop.
 * `ssr: false` is only valid inside Client Components in Next.js App Router.
 */
import dynamic from "next/dynamic";

const EmailCapturePop = dynamic(
  () => import("./EmailCapturePop").then((m) => m.EmailCapturePop),
  { ssr: false },
);

export function EmailCapturePopLoader() {
  return <EmailCapturePop />;
}

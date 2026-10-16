/**
 * Hobby includes 4 hours of Fluid Active CPU per 30 days. Past that, Vercel
 * can stop running functions until the window resets. Checkout, the Stripe
 * webhook, and any page that is not already on the CDN all need a function.
 * Image generation, pin compositing, and metric crawls do not.
 *
 * Those jobs stay skipped until `FLUID_CPU_RESERVE=off`.
 */
import { NextResponse } from "next/server";

export function heavyBackgroundPaused(): boolean {
  const flag = process.env.FLUID_CPU_RESERVE?.trim().toLowerCase();
  return flag !== "off" && flag !== "0" && flag !== "false";
}

export function heavyBackgroundPausedResponse(): NextResponse {
  return NextResponse.json({
    ok: true,
    skipped: true,
    reason: "fluid-cpu-reserve",
  });
}
